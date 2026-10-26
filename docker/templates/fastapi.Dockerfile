# FastAPI — Python with uvicorn ASGI server

FROM python:3.12-slim AS build
WORKDIR /app

COPY requirements*.txt ./
RUN pip install --no-cache-dir --user -r requirements.txt

FROM python:3.12-slim
WORKDIR /app

COPY --from=build /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
