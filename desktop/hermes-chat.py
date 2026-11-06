#!/usr/bin/python3
"""Connect authenticated Neko chat commands to the local Hermes desktop agent."""
import asyncio
from contextlib import suppress
import json
import logging
import os
from pathlib import Path
import re
import signal
import stat
import socket as unix_socket
from urllib.parse import quote

import httpx
from dotenv import dotenv_values
import websockets

HOME = Path.home()
CONFIG = HOME / '.config/foxbard/neko.json'
STATE = HOME / '.local/state/foxbard'
HERMES = HOME / '.local/bin/hermes'
HELP = ('Type a request here to talk to Hermes and control this shared KDE desktop. '
        'Commands: /status, /stop, /new, /approve, /deny. '
        'Everyone in this room can see requests and replies.')
CONTEXT = ('You are Hermes, assisting visitors through Neko chat on their shared KDE desktop. '
           'Use computer_use for visible desktop interaction; DISPLAY=:99.0 is the screen they see. '
           'Use terminal and file tools for development tasks when useful. '
           'Do not start a separate desktop or stop Neko, Xorg, or the chat bridge. '
           'Keep replies concise. Never show credentials in chat. '
           'When you need user input, use the clarify tool with one question at a time and choices when useful. '
           'If an action needs approval you cannot obtain here, explain how to do it in Konsole. '
           'The following is the visitor request:\n')


def desktop_environment():
    env = os.environ.copy()
    env.update(HOME=str(HOME), DISPLAY=':99.0', LANG='C.UTF-8',
               XDG_RUNTIME_DIR=f'/run/user/{os.getuid()}', QT_ACCESSIBILITY='1')
    for comm in Path('/proc').glob('[0-9]*/comm'):
        try:
            if comm.stat().st_uid == os.getuid() and comm.read_text().strip() == 'plasmashell':
                for item in (comm.parent / 'environ').read_bytes().split(b'\0'):
                    if item.startswith(b'DBUS_SESSION_BUS_ADDRESS='):
                        key, value = item.decode().split('=', 1)
                        env[key] = value
        except (OSError, UnicodeDecodeError):
            continue
    if not env.get('DBUS_SESSION_BUS_ADDRESS'):
        for candidate in Path('/tmp').glob('dbus-*'):
            try:
                info = candidate.stat()
                if info.st_uid != os.getuid() or not stat.S_ISSOCK(info.st_mode):
                    continue
                with unix_socket.socket(unix_socket.AF_UNIX) as connection:
                    connection.settimeout(.2)
                    connection.connect(str(candidate))
                env['DBUS_SESSION_BUS_ADDRESS'] = 'unix:path=' + str(candidate)
                break
            except OSError:
                continue
    return env


def has_key():
    return bool(dotenv_values(HOME / '.hermes/.env').get('OPENROUTER_API_KEY'))


class Bridge:
    def __init__(self):
        self.ws = None
        self.task = None
        self.process = None
        self.session_id = None
        self.pending = None
        self.questions = []
        STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
        with suppress(OSError, ValueError):
            self.session_id = json.loads((STATE / 'session.json').read_text()).get('id')

    async def send(self, event, payload):
        await self.ws.send(json.dumps({'event': event, 'payload': payload}))

    async def say(self, text):
        text = str(text).strip()[:4000]
        # Neko accepts at most 512 Unicode characters in a chat message.
        for offset in range(0, len(text), 480):
            await self.send('chat/message', {'text': text[offset:offset + 480]})

    async def stop(self):
        if self.task and not self.task.done():
            self.task.cancel()
            with suppress(asyncio.CancelledError, Exception):
                await self.task
            return True
        return False

    async def kill_process(self):
        process = self.process
        if not process or process.returncode is not None:
            return
        if process.stdin and not process.stdin.is_closing():
            with suppress(Exception):
                process.stdin.write(b'{"command":"stop"}\n')
                await process.stdin.drain()
        with suppress(ProcessLookupError):
            os.killpg(process.pid, signal.SIGTERM)
        try:
            await asyncio.wait_for(process.wait(), 3)
        except asyncio.TimeoutError:
            with suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGKILL)
            await process.wait()

    async def run(self, prompt):
        try:
            args = [str(HERMES), '--run-module', 'foxbard_runner']
            with (STATE / 'agent.log').open('w') as log:
                os.chmod(STATE / 'agent.log', 0o600)
                self.process = await asyncio.create_subprocess_exec(
                    *args, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                    stderr=log, env=desktop_environment(), start_new_session=True,
                    limit=4 * 1024 * 1024)
                self.process.stdin.write((json.dumps({'prompt': CONTEXT + prompt, 'session_id': self.session_id}) + '\n').encode())
                await self.process.stdin.drain()
                result = None
                async with asyncio.timeout(270):
                    async for line in self.process.stdout:
                        try:
                            event = json.loads(line)
                        except (ValueError, UnicodeDecodeError):
                            continue
                        if event.get('type') == 'session':
                            self.session_id = event['id']
                            (STATE / 'session.json').write_text(json.dumps({'id': self.session_id}))
                            os.chmod(STATE / 'session.json', 0o600)
                        if event.get('type') in ('approval', 'clarify'):
                            if self.pending and self.pending['id'] != event['id']:
                                if not any(item['id'] == event['id'] for item in self.questions):
                                    self.questions.append(event)
                            else:
                                self.pending = event
                                await self.show_question()
                        if event.get('type') == 'tool_use':
                            await self.say('Working: ' + str(event.get('name', 'desktop action')))
                        if event.get('type') == 'result':
                            result = event
                    await self.process.wait()
                if result and result.get('session_id'):
                    self.session_id = result['session_id']
                    path = STATE / 'session.json'
                    temporary = STATE / 'session.json.tmp'
                    temporary.write_text(json.dumps({'id': self.session_id}))
                    os.chmod(temporary, 0o600)
                    temporary.replace(path)
                if result and result.get('text'):
                    await self.say(result['text'])
                elif self.process.returncode:
                    await self.say('Hermes could not complete this request. Check ~/.local/state/foxbard/agent.log in Konsole for the cause. Use hermes model to check your OpenRouter configuration, or /new if a previous session cannot resume.')
                else:
                    await self.say('Hermes finished without a text reply. Check the desktop for changes.')
        except asyncio.CancelledError:
            raise
        except TimeoutError:
            await self.say('The request reached its time limit and was stopped. Send a smaller task to continue.')
        except Exception:
            logging.exception('Hermes request failed')
            with suppress(Exception):
                await self.say('The request failed. Check ~/.local/state/foxbard/agent.log in Konsole, then retry.')
        finally:
            await self.kill_process()
            self.process = None
            self.pending = None
            self.questions.clear()

    async def show_question(self):
        question = self.pending
        if not question:
            return
        labels = ['Allow once', 'Deny'] if question['type'] == 'approval' else question.get('choices', [])
        labels = [str(item.get('label') or item.get('text') or item.get('value') or '') if isinstance(item, dict) else str(item) for item in labels]
        question['choices'] = labels
        await self.say(question.get('text') or 'Hermes needs your input.')
        if labels:
            await self.say('\n'.join(f'{i + 1}. {label}' for i, label in enumerate(labels)))
        metadata = {'id': question['id'], 'kind': question['type'], 'choices': [label[:40] for label in labels[:6]]}
        while True:
            card = 'Choose an option below, or type your answer.\n<!--hermes-question:' + json.dumps(metadata, ensure_ascii=False, separators=(',', ':')) + '-->'
            if len(card) <= 512:
                await self.send('chat/message', {'text': card})
                break
            if not metadata['choices']:
                await self.say('Type your answer in chat.')
                break
            metadata['choices'].pop()

    async def answer(self, text, metadata=None):
        pending = self.pending
        if not pending or not self.process or self.process.returncode is not None:
            await self.say('That question is no longer waiting for an answer.')
            return
        if metadata and metadata.get('id') != pending['id']:
            await self.say('That question has expired. Please answer the latest question.')
            return
        choices = pending.get('choices', [])
        choice = metadata.get('choice') if metadata else None
        if choice is not None:
            if not isinstance(choice, int) or isinstance(choice, bool) or not 0 <= choice < len(choices):
                await self.say('Please choose one of the listed options, or type your answer.')
                return
            text = choices[choice]
        elif text.isdigit() and 1 <= int(text) <= len(choices):
            text = choices[int(text) - 1]
        if pending['type'] == 'approval':
            value = text.strip().lower().removeprefix('/')
            if value in ('approve', 'allow', 'allow once', 'yes', 'y', 'ok', 'okay'):
                command = 'approve'
            elif value in ('deny', 'no', 'n', 'cancel'):
                command = 'deny'
            else:
                await self.say('For this action, choose Allow once or Deny, or type yes or no. Use /stop to change the task.')
                return
        else:
            command = 'answer'
        payload = {'command': command, 'id': pending['id'], 'text': text}
        self.process.stdin.write((json.dumps(payload) + '\n').encode())
        await self.process.stdin.drain()
        self.pending = self.questions.pop(0) if self.questions else None
        await self.say('Response sent to Hermes.')
        if self.pending:
            await self.show_question()

    async def handle(self, text):
        metadata = None
        marker = re.search(r'\n?<!--hermes-answer:(\{.*\})-->$', text, re.S)
        if marker:
            try:
                metadata = json.loads(marker.group(1))
            except ValueError:
                await self.say('This answer could not be read. Please type it again.')
                return
            if not isinstance(metadata, dict) or not isinstance(metadata.get('id'), str) or not metadata['id']:
                await self.say('This answer could not be read. Please type it again.')
                return
            text = text[:marker.start()]
        match = re.match(r'^@hermes(?:\s+(.*))?$', text.strip(), re.I | re.S)
        prompt = ((match.group(1) or '') if match else text).strip()
        if not prompt and not match:
            return
        command = prompt.lower().removeprefix('/')
        if metadata:
            await self.answer(prompt, metadata)
        elif command in ('', 'help'):
            await self.say(HELP)
        elif command == 'status':
            status = 'waiting for your response' if self.pending else ('working' if self.task and not self.task.done() else 'idle')
            key = 'OpenRouter key saved' if has_key() else 'OpenRouter key missing; run foxbard-openrouter in Konsole'
            await self.say(f'Hermes is {status}; {key}. Desktop: KDE :99.0.')
            await self.show_question()
        elif command == 'stop':
            stopped = await self.stop()
            await self.say('Stopped the active request.' if stopped else 'No request is running.')
        elif self.pending:
            await self.answer(prompt.removeprefix('/answer ').removeprefix('answer '))
        elif command in ('approve', 'deny') or command.startswith('answer '):
            await self.say('No action is waiting for a response.')
        elif self.task and not self.task.done():
            await self.say('A request is already running. Use /stop before starting another.')
        elif command == 'new':
            self.session_id = None
            (STATE / 'session.json').unlink(missing_ok=True)
            await self.say('Started a new conversation. Desktop files and windows are unchanged.')
        elif not has_key():
            await self.say('Enter your OpenRouter API key in the desktop first: open Konsole and run foxbard-openrouter. Then resend this request.')
        else:
            await self.say('Starting. Use /stop to interrupt.')
            self.task = asyncio.create_task(self.run(prompt))

    async def connect(self):
        config = json.loads(CONFIG.read_text())
        base = 'http://127.0.0.1:8081'
        async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
            response = await client.post(base + '/api/login', json={
                'username': 'Hermes', 'password': config['password']})
            response.raise_for_status()
            login = response.json()
            token, own_id = login['token'], login['id']
            try:
                async with websockets.connect('ws://127.0.0.1:8081/api/ws?token=' + quote(token),
                                               max_size=1024 * 1024) as ws:
                    self.ws = ws
                    logging.info('Connected to Neko chat')
                    async for raw in ws:
                        message = json.loads(raw)
                        payload = message.get('payload') or {}
                        if message['event'] == 'system/heartbeat':
                            await self.send('client/heartbeat', {})
                        elif message['event'] == 'chat/message' and payload.get('id') != own_id:
                            await self.handle(payload.get('content', {}).get('text', ''))
            finally:
                await self.stop()
                with suppress(Exception):
                    await client.post(base + '/api/logout', headers={'Authorization': 'Bearer ' + token})
                self.ws = None

    async def serve(self):
        while True:
            try:
                await self.connect()
            except Exception as error:
                # Avoid logging URLs: the WebSocket URL contains a session token.
                logging.warning('Chat connection unavailable (%s); retrying', type(error).__name__)
            await asyncio.sleep(3)


if __name__ == '__main__':
    os.umask(0o077)
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    asyncio.run(Bridge().serve())
