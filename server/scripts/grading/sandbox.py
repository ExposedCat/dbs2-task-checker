#!/usr/bin/python3 -I
"""Drop OS privileges before starting mongosh in the persistent executor container."""
import ctypes
import os
import resource
import sys

uid, directory = int(sys.argv[1]), sys.argv[2]
resource.setrlimit(resource.RLIMIT_CPU, (15, 15))
resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))
resource.setrlimit(resource.RLIMIT_FSIZE, (16 * 1024 * 1024, 16 * 1024 * 1024))
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
if ctypes.CDLL(None, use_errno=True).prctl(38, 1, 0, 0, 0):  # PR_SET_NO_NEW_PRIVS
    raise OSError(ctypes.get_errno(), 'Cannot disable privilege escalation')
os.setgroups([])
os.setgid(uid)
os.setuid(uid)
os.chdir(directory)
os.execvpe('mongosh', ['mongosh', '--nodb', '--quiet', '--json=canonical'], {
    'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': directory, 'TMPDIR': directory,
    'NODE_OPTIONS': '--require /opt/grading/bootstrap.cjs',
})
