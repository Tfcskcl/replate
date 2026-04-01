#!/bin/bash
# Re-plate Edge Device Install Script
# Run as root on Raspberry Pi Zero 2W (Raspberry Pi OS Lite 64-bit)
# Usage: curl -sSL https://re-plate.in/install.sh | sudo bash

set -e

echo "============================================"
echo "  Re-plate Edge Device Installer v1.0"
echo "============================================"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root: sudo bash install.sh"
  exit 1
fi

# Prompt for config
read -p "Outlet ID: " OUTLET_ID
read -p "Device ID: " DEVICE_ID
read -p "API URL [https://api.re-plate.in]: " API_URL
API_URL=${API_URL:-https://api.re-plate.in}
read -p "API Key: " API_KEY
read -p "Camera source (usb/rtsp/rtmp) [usb]: " CAMERA_SOURCE
CAMERA_SOURCE=${CAMERA_SOURCE:-usb}
if [ "$CAMERA_SOURCE" = "rtsp" ]; then
  read -p "RTSP URL: " RTSP_URL
fi

echo ""
echo "Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq python3 python3-pip python3-venv ffmpeg \
  libgl1-mesa-glx libglib2.0-0 libopencv-dev python3-opencv \
  git curl wget

echo "Creating re-plate user and directories..."
useradd -r -s /bin/false replate 2>/dev/null || true
mkdir -p /opt/replate /etc/replate /var/log

echo "Installing Python dependencies..."
python3 -m venv /opt/replate/venv
/opt/replate/venv/bin/pip install --quiet \
  httpx opencv-python-headless numpy pyyaml psutil asyncio

echo "Downloading edge device code..."
# In production, pull from GitHub releases
# For now, copy from /tmp if pre-staged
if [ -f "/tmp/replate_edge.py" ]; then
  cp /tmp/replate_edge.py /opt/replate/main.py
else
  cat > /opt/replate/main.py << 'PYTHONEOF'
# Placeholder - replace with actual main.py from packages/edge/
import asyncio
async def main():
    print("Re-plate edge device starting...")
    while True:
        await asyncio.sleep(60)
asyncio.run(main())
PYTHONEOF
fi

chown -R replate:replate /opt/replate

echo "Writing config file..."
mkdir -p /etc/replate
cat > /etc/replate/config.yaml << EOF
outlet_id: "${OUTLET_ID}"
device_id: "${DEVICE_ID}"
api_url: "${API_URL}"
api_key: "${API_KEY}"
camera_source: "${CAMERA_SOURCE}"
usb_device: 0
rtsp_url: "${RTSP_URL:-}"
pov_fps: 3
heartbeat_interval: 60
EOF
chmod 600 /etc/replate/config.yaml

echo "Installing systemd service..."
cat > /etc/systemd/system/replate-edge.service << EOF
[Unit]
Description=Re-plate Edge Device
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=replate
ExecStart=/opt/replate/venv/bin/python3 /opt/replate/main.py
Restart=always
RestartSec=10
StandardOutput=append:/var/log/replate-edge.log
StandardError=append:/var/log/replate-edge.log
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable replate-edge
systemctl start replate-edge

echo ""
echo "============================================"
echo "  Installation complete!"
echo "============================================"
echo ""
echo "Service status:"
systemctl status replate-edge --no-pager
echo ""
echo "View logs: journalctl -u replate-edge -f"
echo "Config file: /etc/replate/config.yaml"
echo ""
echo "Next steps:"
echo "  1. Plug DJI Action 2 via USB-C"
echo "  2. Verify: ls /dev/video* (should show /dev/video0)"
echo "  3. Check portal: ${API_URL}/api/devices/${DEVICE_ID}"
