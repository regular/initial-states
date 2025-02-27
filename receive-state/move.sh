set -euo pipefail
SRC=$1
DEST=$2

# We cannot delete DEST because it is a read-only mount
#rm -rf $DEST/* || true
#mkdir -p $(dirname $DEST)
#mv $SRC $DEST

# Check if directories exist
if [ ! -d "$SRC" ]; then
  echo "Error: Source directory $SRC does not exist"
  exit 1
fi

if [ ! -d "$DEST" ]; then
  echo "Error: Destination directory $DEST does not exist"
  exit 1
fi

# Check if DEST is writable (contents, not the directory itself)
if [ ! -w "$DEST" ]; then
  echo "Error: Cannot write to contents of $DEST"
  exit 1
fi

# Remove all contents from DEST (including hidden files)
find "$DEST" -mindepth 1 -delete

# Move all contents from SRC to DEST (including hidden files and subdirectories)
# We'll use find with only mindepth 1 to get the top level entries, then mv them
find "$SRC" -mindepth 1 -maxdepth 1 -print0 | xargs -0 -I{} mv {} "$DEST/"

# Verify the move operation
if [ "$(find "$SRC" -mindepth 1 | wc -l)" -ne 0 ]; then
  echo "Warning: Not all files were moved from $SRC"
  exit 1
fi

echo "Successfully moved contents from $SRC to $DEST"
