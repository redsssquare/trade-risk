FROM ubuntu:22.04

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates lsof \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && npm --version \
  && OPENCLAW_NO_PROMPT=1 OPENCLAW_NO_ONBOARD=1 OPENCLAW_USE_GUM=0 OPENCLAW_INSTALL_SH_NO_RUN=1 curl -fsSL https://openclaw.ai/install.sh | bash -s -- --install-method npm --no-prompt --no-onboard \
  && (command -v openclaw || ln -s /root/.openclaw/bin/openclaw /usr/local/bin/openclaw) \
  && command -v openclaw \
  && rm -rf /var/lib/apt/lists/*

EXPOSE 18789

COPY entrypoint.sh /usr/local/bin/openclaw-entrypoint
RUN chmod +x /usr/local/bin/openclaw-entrypoint

CMD ["openclaw-entrypoint"]