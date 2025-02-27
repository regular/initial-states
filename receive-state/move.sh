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

# More forceful approach to clean DEST directory
echo "Cleaning destination directory..."
for item in "$DEST"/* "$DEST"/.[!.]* "$DEST"/..?*; do
  # Skip if no matches are found
  [ -e "$item" ] || continue
  
  # For directories, use rm -rf
  if [ -d "$item" ]; then
    rm -rf "$item" || {
      echo "Warning: Could not remove directory: $item"
      # Make directory writable and try again
      chmod -R u+w "$item" 2>/dev/null
      rm -rf "$item" || {
        echo "Error: Failed to remove directory even after chmod: $item"
        exit 1
      }
    }
  else
    # For files, try to remove and if that fails, make writable first
    rm -f "$item" || {
      echo "Warning: Could not remove file: $item"
      # Make file writable and try again
      chmod u+w "$item" 2>/dev/null
      rm -f "$item" || {
        echo "Error: Failed to remove file even after chmod: $item"
        exit 1
      }
    }
  fi
done

# For cross-filesystem moves, handle each top-level item individually
echo "Moving files from source to destination..."
for item in "$SRC"/* "$SRC"/.[!.]* "$SRC"/..?*; do
  # Skip if no matches are found
  [ -e "$item" ] || continue
  
  base_name=$(basename "$item")
  
  # If destination already exists (despite cleaning), force remove it
  if [ -e "$DEST/$base_name" ]; then
    echo "Warning: Destination still has '$base_name', removing it..."
    rm -rf "$DEST/$base_name" || {
      echo "Error: Could not remove existing item at destination: $DEST/$base_name"
      exit 1
    }
  fi
  
  # Move the item
  mv "$item" "$DEST/" || {
    echo "Error: Failed to move item: $item"
    exit 1
  }
done

# Verify the move operation
if [ "$(find "$SRC" -mindepth 1 | wc -l)" -ne 0 ]; then
  echo "Warning: Not all files were moved from $SRC"
  exit 1
fi

echo "Successfully moved contents from $SRC to $DEST"
