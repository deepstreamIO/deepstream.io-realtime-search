echo $1 

curl -X POST -H "Content-Type: application/json" -d "{
  \"body\": [
    {
        \"topic\": \"record\",
        \"action\": \"delete\",
        \"recordName\": \"$1\"
    }
  ]
}
" "localhost:6020/api/"