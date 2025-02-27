set -euo pipefail
export boundary=boundary-string-037398047ae4e13fcb3d1181622fed6f

t=$(mktemp -d)
echo "Hello!" > $t/readme.md
date > $t/now.txt
tar -czf - -C $t . | bash ../make-transmit-msg.sh > msg.tmp

output=$(cat msg.tmp.tempered | socat - UNIX-CONNECT:sock)

echo "$output" >&2
first_word=$(echo "$output" | head -n1 | awk '{print $1}')
if [ "$first_word" != "ok" ]; then
    exit 1
fi
