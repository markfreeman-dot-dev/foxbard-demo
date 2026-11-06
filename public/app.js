const $ = id => document.getElementById(id);
const message = text => { $('message').textContent = text; };
async function api(path, body) {
  const response = await fetch('/api/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await response.json();
  if (!response.ok) { if (response.status === 401) showLogin(); throw new Error(data.error || 'The request failed. Please try again.'); }
  return data;
}
function showLogin() { $('login').hidden = false; $('workspace').hidden = true; }
async function showWorkspace(name) {
  $('login').hidden = true; $('workspace').hidden = false;
  $('welcome').textContent = 'Welcome, ' + name;
  try { const data = await api('desktop'); $('state').textContent = data.status === 'running' ? 'Desktop is running' : data.status === 'stopped' ? 'Desktop is saved and ready to start' : 'Desktop: ' + data.status; }
  catch (error) { message(error.message); }
}
$('login').onsubmit = async event => {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true; message('Signing in…');
  try { const data = await api('auth', { name: $('name').value, password: $('password').value }); $('password').value = ''; message(''); await showWorkspace(data.name); }
  catch (error) { message(error.message); } finally { button.disabled = false; }
};
$('launch').onclick = async () => {
  $('launch').disabled = true; message('Starting the desktop… This can take up to a minute.');
  try {
    const data = await api('desktop', { action: 'launch' });
    const form = document.createElement('form'); form.method = 'POST'; form.action = data.url;
    const input = document.createElement('input'); input.type = 'hidden'; input.name = 'ticket'; input.value = data.ticket; form.append(input); document.body.append(form); form.submit();
  } catch (error) { message(error.message); $('launch').disabled = false; }
};
$('stop').onclick = async () => {
  if (!confirm('Stop the shared desktop for everyone? Save open work first.')) return;
  $('stop').disabled = true; message('Saving and stopping the shared desktop…');
  try { await api('desktop', { action: 'stop' }); $('state').textContent = 'Desktop is stopped'; message('Saved. You can open the desktop again whenever you need it.'); }
  catch (error) { message(error.message); } finally { $('stop').disabled = false; }
};
$('logout').onclick = async () => {
  try { const desktop = await api('desktop').catch(() => null); await api('auth', { action: 'logout' }); showLogin(); message('You are logged out.'); if (desktop?.status === 'running') location.href = 'https://sb-6186pne7ld4c.vercel.run/gate/logout'; }
  catch (error) { message(error.message); }
};
(async () => {
  if (new URLSearchParams(location.search).has('loggedout')) { await api('auth', { action: 'logout' }); history.replaceState(null, '', '/'); }
  try { const data = await api('auth'); await showWorkspace(data.name); if (new URLSearchParams(location.search).has('reconnect')) { history.replaceState(null, '', '/'); $('launch').click(); } } catch { showLogin(); }
})();
window.addEventListener('pageshow', () => { $('launch').disabled = false; });
