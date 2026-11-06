# The cart page of ao-pilot for the deployer of the kit: Caddy in front keeps HTTPS and basic auth (ADR-0003).
# The package has no runtime dependencies, so the image installs nothing: no npm ci, no prepare script, no
# devDependencies. Node 24 runs src/server.ts as is, by stripping its types.
FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

WORKDIR /app

# Owned by root: the node user reads the code but cannot change it.
COPY package.json ./
COPY src/ ./src/

# The image's own non-root user. Port 3000 needs no capability, so the container runs with --cap-drop ALL and
# --security-opt no-new-privileges. The deployer sets AO_PUBLIC_URL to the URL of the environment.
USER node
EXPOSE 3000
CMD ["node", "src/server.ts"]
