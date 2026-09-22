import sys
from pathlib import Path

# Add project root and backend directory to sys.path
root_dir = str(Path(__file__).resolve().parents[2])
backend_dir = str(Path(__file__).resolve().parents[1])
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
