set -euxo pipefail
DIR=$1
VAULT=$2
ITEM=$3
FIELD=$4

SECRETPATH="$VAULT/$ITEM/$FIELD"

tar -cz -C "$DIR" -f - "." | sudo secretsctl encrypt "$SECRETPATH"
