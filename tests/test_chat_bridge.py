import asyncio
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('bridge', Path(__file__).parents[1] / 'desktop/hermes-chat.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

class SubscriptionTests(unittest.TestCase):
    def test_saved_subscription_credentials(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(bridge, 'HOME', Path(directory)):
            folder = Path(directory) / '.hermes'
            folder.mkdir()
            path = folder / 'auth.json'
            self.assertFalse(bridge.has_subscription())
            (folder / '.env').write_text('OPENROUTER_API_KEY=old-key')
            self.assertFalse(bridge.has_subscription())
            for invalid in ('{', 'null', '[]', '{"credential_pool": null}', '{}'):
                path.write_text(invalid)
                self.assertFalse(bridge.has_subscription())
            for auth in (
                {'credential_pool': {'openai-codex': [{'access_token': 'test-token'}]}},
                {'providers': {'openai-codex': {'tokens': {'access_token': 'test-token'}}}},
            ):
                path.write_text(json.dumps(auth))
                self.assertTrue(bridge.has_subscription())

    def test_previous_provider_session_is_not_resumed(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(bridge, 'STATE', Path(directory)):
            path = Path(directory) / 'session.json'
            path.write_text(json.dumps({'id': 'old-session'}))
            self.assertIsNone(bridge.Bridge().session_id)
            path.write_text(json.dumps({'id': 'subscription-session', 'provider': 'openai-codex'}))
            self.assertEqual(bridge.Bridge().session_id, 'subscription-session')

class ChatTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.state_patch = patch.object(bridge, 'STATE', Path(self.temp.name))
        self.state_patch.start()
        self.bot = bridge.Bridge()
        self.sent = []
        async def say(text): self.sent.append(text)
        self.bot.say = say

    async def asyncTearDown(self):
        await self.bot.stop()
        self.state_patch.stop()
        self.temp.cleanup()

    async def test_plain_message_starts_agent(self):
        received = []
        async def run(prompt): received.append(prompt)
        self.bot.run = run
        with patch.object(bridge, 'has_subscription', return_value=True):
            await self.bot.handle('Open the terminal')
            await self.bot.task
        self.assertEqual(received, ['Open the terminal'])

    async def test_model_selection_reaches_runner(self):
        path = Path(self.temp.name) / 'models.json'
        path.write_text(json.dumps({'models': [{'id': 'gpt-6-sol', 'efforts': ['low', 'medium']}]}))
        received = []
        async def run(prompt, options): received.append((prompt, options))
        self.bot.run = run
        with patch.object(bridge, 'MODELS', path), patch.object(bridge, 'has_subscription', return_value=True):
            await self.bot.handle('Hello\n<!--foxbard-options:{"model":"gpt-6-sol","effort":"low"}-->')
            await self.bot.task
        self.assertEqual(received, [('Hello', {'model': 'gpt-6-sol', 'effort': 'low'})])

    async def test_unavailable_model_or_effort_is_rejected(self):
        path = Path(self.temp.name) / 'models.json'
        path.write_text(json.dumps({'models': [{'id': 'gpt-6-sol', 'efforts': ['low']}]}))
        for options in ({'model': 'other', 'effort': 'low'}, {'model': 'gpt-6-sol', 'effort': 'max'}, []):
            with patch.object(bridge, 'MODELS', path):
                payload = json.dumps(options) if isinstance(options, dict) else '{"unexpected":true}'
                await self.bot.handle('Hello\n<!--foxbard-options:' + payload + '-->')
            self.assertIsNone(self.bot.task)
            self.assertIn('unavailable', self.sent[-1])

    async def test_empty_message_is_ignored(self):
        await self.bot.handle('  ')
        self.assertIsNone(self.bot.task)
        self.assertEqual(self.sent, [])

    async def test_missing_subscription_does_not_start_agent(self):
        with patch.object(bridge, 'has_subscription', return_value=False):
            await self.bot.handle('@hermes open a terminal')
        self.assertIsNone(self.bot.task)
        self.assertIn('ChatGPT subscription', self.sent[0])

    async def test_busy_and_stop(self):
        stopped = asyncio.Event()
        async def job():
            try: await asyncio.sleep(60)
            finally: stopped.set()
        self.bot.task = asyncio.create_task(job())
        await asyncio.sleep(0)
        await self.bot.handle('@hermes another task')
        self.assertIn('already running', self.sent[-1])
        await self.bot.handle('/stop')
        self.assertTrue(stopped.is_set())
        self.assertTrue(self.bot.task.done())

    async def test_response_requires_pending_request(self):
        await self.bot.handle('@hermes approve')
        self.assertEqual(self.sent, ['No action is waiting for a response.'])

    def waiting(self, kind='clarify'):
        from types import SimpleNamespace
        packets = []
        class Input:
            def write(self, data): packets.append(json.loads(data))
            async def drain(self): pass
        self.bot.process = SimpleNamespace(returncode=None, stdin=Input())
        self.bot.pending = {'type': kind, 'id': 'q-1', 'text': 'Which language?', 'choices': ['Python', 'TypeScript']}
        return packets

    async def test_typed_answer_resumes_pending_question(self):
        packets = self.waiting()
        await self.bot.handle('Use Go instead')
        self.assertEqual(packets, [{'command': 'answer', 'id': 'q-1', 'text': 'Use Go instead'}])
        self.assertIsNone(self.bot.pending)
        self.assertIsNone(self.bot.task)

    async def test_choice_button_maps_to_original_option(self):
        packets = self.waiting()
        await self.bot.handle('TypeScript\n<!--hermes-answer:{"id":"q-1","choice":1}-->')
        self.assertEqual(packets[0]['text'], 'TypeScript')

    async def test_old_button_cannot_answer_new_question(self):
        packets = self.waiting()
        await self.bot.handle('Python\n<!--hermes-answer:{"id":"expired","choice":0}-->')
        self.assertEqual(packets, [])
        self.assertIsNotNone(self.bot.pending)
        self.assertIn('expired', self.sent[-1])

    async def test_approval_requires_explicit_yes_or_no(self):
        packets = self.waiting('approval')
        await self.bot.handle('Something different')
        self.assertEqual(packets, [])
        await self.bot.handle('yes')
        self.assertEqual(packets[0]['command'], 'approve')

    async def test_multiple_questions_are_shown_in_order(self):
        packets = self.waiting()
        self.bot.questions.append({'type': 'clarify', 'id': 'q-2', 'text': 'Which editor?', 'choices': []})
        async def send(event, payload): pass
        self.bot.send = send
        await self.bot.handle('Python')
        self.assertEqual(packets[0]['id'], 'q-1')
        self.assertEqual(self.bot.pending['id'], 'q-2')
        self.assertIn('Which editor?', self.sent)

    async def test_chunks_fit_neko_limit(self):
        messages = []
        class Socket:
            async def send(self, text): messages.append(json.loads(text))
        self.bot.ws = Socket()
        await bridge.Bridge.say(self.bot, '🙂' * 1100)
        self.assertEqual(len(messages), 3)
        self.assertTrue(all(len(m['payload']['text']) <= 512 for m in messages))

if __name__ == '__main__': unittest.main()
