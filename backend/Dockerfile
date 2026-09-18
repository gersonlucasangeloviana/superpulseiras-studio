FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.lock.txt ./
RUN pip install --no-cache-dir -r requirements.lock.txt
RUN groupadd --gid 10001 studio && useradd --uid 10001 --gid studio --create-home studio \
    && mkdir -p /app/data/images && chown -R studio:studio /app/data
COPY --chown=studio:studio app.py auth.py database.py ./
COPY --chown=studio:studio migrations ./migrations
USER studio
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-proxy-headers"]
