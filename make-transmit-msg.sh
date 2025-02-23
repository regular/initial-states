echo -ne "boundary=$boundary\r\n"
echo -ne "content-type=application/gzip\r\n"
echo -ne "\r\n"

tmpfile=$(mktemp)
cat - | tee >(sha256 | cut -d' ' -f1 > "$tmpfile")
sha256=$(cat "$tmpfile")
rm "$tmpfile"

echo -ne "\r\n"
echo -ne "${boundary}\r\n"
echo -ne "sha256=${sha256}\r\n"

