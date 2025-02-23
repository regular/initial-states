set -euo pipefail
DEST=$1

mkdir -p $DEST
tar -xzf - -C $DEST
