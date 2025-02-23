local DIR=$1
local VAULT=$2
local ITEM=$3
local FIELD=$4

tar -cz -C "$DIR" -f - * | secretsctl encrypt "$SECRETPATH"
