#!/usr/bin/python3
"""Save the OpenRouter key without displaying it or putting it in shell history."""
import getpass
import os
from pathlib import Path
import subprocess
import tempfile

path = Path.home() / '.hermes' / '.env'
key = getpass.getpass('OpenRouter API key (hidden): ').strip()
if not key or '\n' in key or '\r' in key or not key.startswith('sk-or-'):
    raise SystemExit('No valid OpenRouter key was saved. Run this setup again to retry.')
lines = path.read_text().splitlines() if path.exists() else []
lines = [line for line in lines if not line.strip().startswith(('OPENROUTER_API_KEY=', 'export OPENROUTER_API_KEY='))]
lines.append('OPENROUTER_API_KEY=' + key)
path.parent.mkdir(parents=True, exist_ok=True)
fd, temporary = tempfile.mkstemp(dir=path.parent)
with os.fdopen(fd, 'w') as output:
    output.write('\n'.join(lines) + '\n')
os.chmod(temporary, 0o600)
os.replace(temporary, path)
print('Key saved. Choose an OpenRouter model in the next screen.')
subprocess.run([str(Path.home() / '.local/bin/hermes'), 'config', 'set', 'model.provider', 'openrouter'], check=True)
subprocess.run([str(Path.home() / '.local/bin/hermes'), 'model'], check=False)
input('Setup finished. Press Enter to close this window.')
