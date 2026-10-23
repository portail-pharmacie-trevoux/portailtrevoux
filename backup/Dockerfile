FROM postgres:18-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/backup-venv && /opt/backup-venv/bin/pip install --no-cache-dir boto3==1.40.69 cryptography==46.0.3
ENV PATH="/opt/backup-venv/bin:$PATH"
WORKDIR /opt/backup
COPY backup/backup.py /opt/backup/backup.py
ENTRYPOINT ["python", "/opt/backup/backup.py"]
CMD ["backup"]
