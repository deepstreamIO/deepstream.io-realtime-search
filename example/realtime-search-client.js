const { DeepstreamClient } =  require('@deepstream/client')

async function app () {
    const client = new DeepstreamClient('ws://localhost:6020')
    await client.login()

    // Let us set some dummy data to filter down later
    // Setting them sync isn't best practice but makes for prettier demo code
    await client.record.setDataWithAck('user/12345', { name: 'Bob', age: 30 })
    await client.record.setDataWithAck('user/54321', { name: 'John', age: 60 })
    await client.record.setDataWithAck('user/32154', { name: 'Joseph', age: 35 })

    // And now we search!

    /**
     * In order to do the search we call an RPC with the table and query parameters
     * The query parameters are tuples of three:
     * 
     * [fieldName, operator, value]
     * 
     * Where the operators can be one of:
     * 
     * [ eq, ne, match, gt, ge, lt, le, in, contains ]
     * 
     * And you can AND them together by just having more:
     * 
     * [[fieldName, operator, value], [fieldName, operator, value], [fieldName, operator, value]]
     */
    const hash = await client.rpc.make('realtime_search', {
        table: 'user',
        // age greater than equal to 30
        query: [['age', 'gt', 30]]
    })

    const resultList = client.record.getList(`realtime_search/list_${hash}`)
    resultList.subscribe(results => {
        // Results
        console.log('>', results)
    }, true)

    // Let us change a users age, if everything is working correctly 
    // it should trigger the above console almost instantly
    await new Promise(resolve => setTimeout(resolve, 3000))
    await client.record.setDataWithAck('user/32154', { name: 'Joseph', age: 50 })
}

app()
