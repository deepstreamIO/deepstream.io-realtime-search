if [[ -z $1 ]] || [[ -z $2 ]] || [[ -z $3 ]]; then
  echo "Must provide record name, name and age"
  exit 1
fi

curl -X POST -H "Content-Type: application/json" -d "{
  \"body\": [
    {
        \"topic\": \"record\",
        \"action\": \"write\",
        \"recordName\": \"$1\",
        \"data\": {
            \"name\": \"$2\",
            \"age\": $3
        }
    }
  ]
}
" "localhost:6020/api/"