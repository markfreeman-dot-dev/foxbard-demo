"""Save the subscription's model choices without exposing credentials."""
import json
from pathlib import Path

import httpx
from agent.codex_headers import codex_account_headers
from agent.model_metadata import fetch_codex_catalog_entries
from agent.reasoning_effort import codex_supported_efforts
from hermes_cli.auth import resolve_codex_runtime_credentials
from hermes_cli.codex_models import _ranked_slugs
from hermes_cli.config import load_config_readonly


def main():
    credentials = resolve_codex_runtime_credentials()
    token = credentials['api_key']
    headers = {'Authorization': f'Bearer {token}', **codex_account_headers(token)}
    entries, status = fetch_codex_catalog_entries(
        lambda url: httpx.get(url, headers=headers, timeout=15), base_url=credentials['base_url'])
    models = _ranked_slugs(entries)
    if not models:
        raise RuntimeError(f'OpenAI returned no model choices (HTTP {status}). Existing choices were kept.')
    configured = load_config_readonly().get('model', {}).get('default')
    default = configured if configured in models else models[0]
    advertised = {entry['slug']: {level['effort'] for level in entry.get('supported_reasoning_levels', [])}
                  for entry in entries if isinstance(entry, dict) and entry.get('slug')}
    catalog = {'default': default, 'models': [
        {'id': model, 'efforts': [effort for effort in codex_supported_efforts(model)
                                  if effort in advertised.get(model, set())]} for model in models]}
    catalog['models'] = [model for model in catalog['models'] if model['efforts']]
    if not catalog['models']:
        raise RuntimeError('No compatible reasoning levels were returned. Existing choices were kept.')
    path = Path.home() / '.config/foxbard/models.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(catalog))
    temporary.chmod(0o600)
    temporary.replace(path)
    print(json.dumps(catalog))


if __name__ == '__main__':
    main()
