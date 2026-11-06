"""Run one Neko request through Hermes's gateway, with live chat controls."""
import asyncio
from contextlib import suppress
import json
import os
from pathlib import Path
import signal
import sys
import uuid

from hermes_cli.gateway_client import connect_gateway
from hermes_cli.gateway_chat import shell_client_env
from hermes_cli.gateway_chat_view import GatewayChatView
from hermes_cli.stream_json import StreamJsonEmitter


def emit(value):
    print(json.dumps(value), flush=True)


class ChatView(GatewayChatView):
    def show_prompt(self, prompt):
        emit({'type': 'approval' if prompt['kind'] == 'approval' else 'clarify',
              'id': prompt['prompt_id'], 'text': prompt.get('command') or prompt.get('question') or prompt.get('description'),
              'choices': prompt.get('options') or prompt.get('choices') or []})


async def main():
    reader = asyncio.StreamReader()
    await asyncio.get_running_loop().connect_read_pipe(lambda: asyncio.StreamReaderProtocol(reader), sys.stdin)
    request = json.loads(await reader.readline())
    async with connect_gateway() as client:
        if request.get('session_id'):
            snapshot = await client.rpc('session.resume', session_id=request['session_id'])
        else:
            snapshot = await client.rpc('session.create', request_id=uuid.uuid4().hex, source='cli',
                                        provider='openrouter', toolsets=['terminal', 'file', 'computer_use', 'clarify'],
                                        max_turns=25, cwd=str(Path.home()), client_env=shell_client_env())
        sid = snapshot['stored_session_id']
        emit({'type': 'session', 'id': sid})
        emitter = StreamJsonEmitter(session_id=sid)
        view = ChatView(client, snapshot, quiet=True, emitter=emitter)
        if view.unknown_admissions():
            raise RuntimeError('Previous request has an unknown outcome. Use /new after checking the desktop.')
        renderer = asyncio.create_task(view.render())
        async def control():
            while line := await reader.readline():
                message = json.loads(line)
                if message.get('command') == 'stop':
                    await view.command('/stop')
                    emit({'type': 'stopped'})
                elif message.get('command') in ('approve', 'deny'):
                    choice = 'once' if message['command'] == 'approve' else 'deny'
                    await view.command('/approve ' + message['id'] + ' ' + choice)
                elif message.get('command') == 'answer':
                    await view.command('/answer ' + message['id'] + ' ' + message['text'])
            await view.command('/stop')
        controls = asyncio.create_task(control())
        loop = asyncio.get_running_loop()
        loop.add_signal_handler(signal.SIGTERM, lambda: asyncio.create_task(view.command('/stop')))
        try:
            receipt = await view.submit(request['prompt'])
            admission = receipt['admission_id']
            async with asyncio.timeout(260):
                while admission not in view.completions:
                    if view.failure:
                        raise RuntimeError(str(view.failure))
                    if controls.done():
                        controls.result()
                    await asyncio.sleep(.1)
            result = view.completions[admission]
            emit({'type': 'result', 'session_id': sid, 'text': result.get('text') or result.get('content') or '',
                  'exit_code': 0 if result.get('status') != 'failed' else 1})
        finally:
            if 'admission' in locals() and admission not in view.completions:
                with suppress(Exception):
                    await view.command('/stop')
            renderer.cancel()
            controls.cancel()
            await asyncio.gather(renderer, controls, return_exceptions=True)


if __name__ == '__main__':
    asyncio.run(main())
