# Django — Python with gunicorn WSGI server
# Attempts to discover the WSGI application module automatically

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

# Collect static files if manage.py exists
RUN if [ -f manage.py ]; then python manage.py collectstatic --noinput 2>/dev/null || true; fi

EXPOSE 8000

# Try to find the WSGI module: look for wsgi.py in subdirectories
CMD ["sh", "-c", "WSGI_MODULE=$(find . -name wsgi.py -not -path './venv/*' | head -1 | sed 's|^\\./||;s|/|.|g;s|\\.py$||'); gunicorn --bind 0.0.0.0:8000 --workers 2 ${WSGI_MODULE:-config.wsgi}:application"]
