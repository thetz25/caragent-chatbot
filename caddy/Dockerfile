FROM caddy:2-alpine

# Copy Caddyfile
COPY Caddyfile /etc/caddy/Caddyfile

# Create log directory
RUN mkdir -p /var/log/caddy

# Expose ports
EXPOSE 80 443 443/udp

# Volume for persistent data (certificates, etc.)
VOLUME ["/data", "/config"]
