"""Entry point — adds src/ to path and starts the FastAPI server."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src'))

from main import app
import uvicorn

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
