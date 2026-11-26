ARG REDIS_IMAGE=redis:7.4-alpine
FROM ${REDIS_IMAGE}
USER root
COPY docker/redis-entrypoint.sh /usr/local/bin/redis-entrypoint.sh
RUN chmod 0555 /usr/local/bin/redis-entrypoint.sh
USER redis
ENTRYPOINT ["/usr/local/bin/redis-entrypoint.sh"]
