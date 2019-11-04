#!/bin/bash

mongodb1=`getent hosts mongo | awk '{ print $1 }'`

echo "Waiting for startup.."
until mongo --host mongo:27017 --eval 'quit(db.runCommand({ ping: 1 }).ok ? 0 : 2)' &>/dev/null; do
  printf '.'
  sleep 1
done

echo "Starting replica set.."
mongo --host mongo:27017 <<EOF
  var cfg = {
    "_id": "rs0",
    "protocolVersion": 1,
    "members": [
      {
        "_id": 0,
        "host": "${mongodb1}:27017"
      }
    ]
  };
  rs.initiate(cfg, { force: true });
  rs.reconfig(cfg, { force: true });
EOF

echo "Replica set started!"