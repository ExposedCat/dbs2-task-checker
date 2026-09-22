# SSH approval login

The deployed implementation uses the host grading broker and Linux SO_PEERCRED. See
[installation and migration](../grading/README.md). It requires no sudo or tunnel.
The older sudo helper files in this directory are an alternative, not used in production.

The browser creates a one-minute code and keeps a separate 256-bit polling secret.
The student runs the displayed `portal-login CODE` command in an authenticated SSH session.
The host broker identifies the caller using the kernel-provided UID, then forwards approval
to the API's private Unix socket. The browser redeems it once for an eight-hour JWT.
No password endpoint or password fallback remains. Approval requires an existing portal user.

Only approve codes displayed in your own browser. Codes can be relayed by phishing; HTTP
still permits interception/modification of the page and resulting session. SSH approval
avoids sending or storing the reusable student password, but does not make HTTP secure.

Pending codes are held in one API process and vanish on restart. Creation is limited to
120 codes/minute and 500 pending codes. Expiration is checked on approval and redemption.
The broker's public socket only accepts code approval; its private control socket and
API approval socket must remain inaccessible to student accounts and submission containers.
