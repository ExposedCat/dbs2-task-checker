# CTU | DBS2 | Task Checker (Frontend)

## Description

This package is a frontend for the Task Checker application

## Local development

From the repository root, run `docker compose -f compose.dev.yaml up -d --build`
(or use `podman-compose`) and open http://127.0.0.1:3000. Compose runs Vite and npm
inside the frontend container and proxies `/api` to the backend. Source changes reload
automatically. See the root README for the grading broker prerequisites.

## Tech Stack

- Language: **TypeScript (JavaScript)**
- Runtime: **Browser**
- Framework: **React.JS**
- Dev tool: **Vite**
- Runtime type validation: none (relies on server)
- Style engine: **Panda CSS**
- Icons: **react-icons** (Free FontAwesome pack)

## License

This code is licensed under the EUPL-1.2-only license
