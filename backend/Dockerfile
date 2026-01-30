FROM python:3.12-slim

USER root
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libasound2 \
    libasound2-dev \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"

WORKDIR /app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

COPY --chown=user . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]