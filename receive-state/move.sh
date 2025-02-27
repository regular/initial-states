set -euo pipefail
SRC=$1
DEST=$2

rm -rf $DEST || true
mkdir -p $(dirname $DEST)
mv $SRC $DEST

