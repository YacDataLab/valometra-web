FROM node:24-bookworm-slim

# Python 3 : requis par scripts/build.py (génère dist/server/index.js)
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# wrangler (workerd local + D1 en SQLite) : version figée
RUN npm install -g wrangler@4.165.0 \
 && npm cache clean --force

WORKDIR /app
COPY package.json ./
COPY scripts ./scripts
COPY worker ./worker
COPY drizzle ./drizzle
COPY public ./public
RUN python3 scripts/build.py

# Données D1 locales (SQLite) : à monter en volume pour persister
ENV WRANGLER_SEND_METRICS=false \
    CI=1
VOLUME /data
EXPOSE 8787

# Applique les migrations puis lance le Worker sur 0.0.0.0:8787
CMD ["sh", "-c", "wrangler d1 migrations apply valometra-leads --local --config dist/server/wrangler.json --persist-to /data && exec wrangler dev --local --config dist/server/wrangler.json --ip 0.0.0.0 --port 8787 --persist-to /data"]
