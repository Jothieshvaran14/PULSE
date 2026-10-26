# Flask — Python with gunicorn WSGI server

FROM python:3.12-slim AS build
WORKDIR /app

COPY requirements*.txt ./
RUN pip install --no-cache-dir --user -r requirements.txt
RUN pip install --no-cache-dir --user gunicorn

FROM python:3.12-slim
WORKDIR /app

COPY --from=build /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

COPY . .
EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "app:app"]
