#!/usr/bin/env python3
import fcntl
import json
import os
import subprocess
import time
import urllib.request

with open('/tmp/foxbard-start.lock', 'w') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    if subprocess.run(['pgrep', '-x', 'supervisord'], stdout=subprocess.DEVNULL).returncode:
        for path in ['/tmp/.X99-lock', '/tmp/.X11-unix/X99', '/run/dbus/pid', '/var/run/docker.pid', '/run/docker/containerd/containerd.pid']:
            try:
                os.unlink(path)
            except FileNotFoundError:
                pass
        os.makedirs('/run/dbus', exist_ok=True)
        subprocess.run(['dbus-daemon', '--system', '--fork'], check=True)
        with open('/etc/foxbard/gate.json') as source:
            config = json.load(source)
        env = {**os.environ, 'USER': 'neko', 'DISPLAY': ':99.0', 'LANG': 'C.UTF-8', 'QT_ACCESSIBILITY': '1',
               'NEKO_MEMBER_MULTIUSER_USER_PASSWORD': config['password'],
               'NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD': config['adminPassword'],
               'NEKO_DESKTOP_SCREEN': '1280x720@30', 'NEKO_SESSION_IMPLICIT_HOSTING': 'true'}
        with open('/var/log/foxbard-start.log', 'a') as log:
            subprocess.Popen(['/usr/bin/supervisord', '-c', '/etc/neko/supervisord.conf'], env=env, stdout=log, stderr=log, start_new_session=True)
    for _ in range(50):
        try:
            urllib.request.urlopen('http://127.0.0.1:8081', timeout=2)
            try:
                urllib.request.urlopen('http://127.0.0.1:8080', timeout=2)
            except urllib.error.HTTPError as error:
                if error.code == 401:
                    print('Desktop and password gate are ready.')
                    break
        except Exception:
            pass
        time.sleep(1)
    else:
        raise SystemExit('Desktop services did not become ready within 50 seconds.')
