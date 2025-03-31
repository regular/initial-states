set -euo pipefail
DIR=$1
VAULT=$2
ITEM=$3
FIELD=$4

STATEPATH="/var/lib/initial-states/$VAULT/$ITEM/$FIELD"
mkdir -p $(dirname "$STATEPATH")
tar -cvz -C "$DIR" -f - "." | $MAKE_TRANSMIT_MSG > $STATEPATH

#SECRETPATH="$VAULT/$ITEM/$FIELD"
#OUTPUT=$(tar -cz -C "$DIR" -f - "." | sudo secretsctl encrypt "$SECRETPATH")
#echo "$OUTPUT" >&2
#first_word=$(echo "$OUTPUT" | head -n1 | awk '{print $1}')
#if [ "$first_word" != "ok" ]; then
#    exit 1
#fi
