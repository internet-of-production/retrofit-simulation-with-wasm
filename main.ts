import {
    OPCUAClient,
    MessageSecurityMode,
    SecurityPolicy,
    AttributeIds,
    makeBrowsePath,
    ClientSubscription,
    TimestampsToReturn,
    MonitoringParametersOptions,
    ReadValueIdOptions,
    ClientMonitoredItem,
    DataValue, ClientSession
} from "node-opcua";

const loader = require("@assemblyscript/loader");
const fs = require("fs");
const mqtt = require('mqtt')

//One can add JS functions that are called in Wasm in imports
const imports = { /* imports go here */ };
const wasmModule = loader.instantiateSync(fs.readFileSync(__dirname + "/build/release.wasm"), imports);
module.exports = wasmModule.exports; //module.exports refers exports property of wasmModule. It allows us to use a wasmModule like a JSModule.

const {
        getIDAirConditionerTemp,
        getIDOvenPowerStatus,
        getIDBakingTime,
        getIDBakingElapsedTime,
        getIDOvenDoorStatus,
        getOpcEndpoint,
        getMQTTOptions,
        isBakingTimeAcceptable
} = module.exports

//__getString copies a string's value from the module's memory to a JavaScript string.
const {__newString, __getString} = module.exports


const connectionStrategy = {
    initialDelay: 1000,
    maxRetry: 1
}
const options = {
    applicationName: "MyClient",
    connectionStrategy: connectionStrategy,
    securityMode: MessageSecurityMode.None,
    securityPolicy: SecurityPolicy.None,
    endpointMustExist: false,
};
const client = OPCUAClient.create(options);
const endpointUrl = __getString(getOpcEndpoint());
//const endpointUrl = "opc.tcp://0.0.0.0:4840/freeopcua/server/" //local sample server url
let isItemInOven = false;
let bakingTime;
let totalBakingTime // In the case that oven turns off and on again for a single item.
let definedBakeTime;
let bakingTimeError = false;
let bakingInterrupted = false;
let mqttMsg;

async function timeout(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {

    const optionMqttJSON = JSON.parse(__getString(getMQTTOptions()))
    const options = {
        //clientId:optionJSON.clientId,
        port:optionMqttJSON.port,
        //host:'192.168.0.10',//MQTT broker at the mock factory
        host:optionMqttJSON.host,
        rejectUnauthorized:optionMqttJSON.rejectUnauthorized,
        reconnectPeriod: optionMqttJSON.reconnectPeriod
    }
    const mqttClient  = mqtt.connect(options);

    mqttClient.on('connect', function () {
        mqttClient.subscribe('presence', function (err) {
            if (!err) {
                mqttClient.publish('connection', 'MQTT: Connected')
                console.log("MQTT connected")
            }
        })
    })

    //Listening messages from the broker
    mqttClient.on('message', function (topic, message) {
        // message is Buffer
        console.log(message.toString())
    })

    //Display error
    client.on('error', function(err) {
        console.dir(err)
    })


    try {
        // step 1 : connect to
        await client.connect(endpointUrl);
        console.log("connected !");

        // step 2 : createSession
        const session = await client.createSession();
        console.log("session created !");

        // step 3 : browsing root folder
        const browseResult = await session.browse("RootFolder");

        console.log("references of RootFolder :");
        for(const reference of browseResult.references) {
            console.log( "   -> ", reference.browseName.toString());
        }

        // step 4 : read a variable with readVariableValue
        let ovenPowerStatus = await session.read({
            nodeId: 'ns=3;s="QX_MPO_LightOven_Q9"',
            attributeId: AttributeIds.Value
        });
        console.log(" ovenPowerStatus = ", ovenPowerStatus.toString());

        //Get the expected baking time length
        definedBakeTime = await session.read({
            nodeId: 'ns=3;s="PRG_MPO_Ablauf_DB"."Bake_TIme"',
            attributeId: AttributeIds.Value
        });
        console.log('expectedBakeTime:')
        console.log("---->", definedBakeTime.toString())
        console.log(definedBakeTime.value.value.toString())
        // step 5: install a subscription and install a monitored item for 10 seconds
        const subscription = ClientSubscription.create(session, {
            requestedPublishingInterval: 1000,
            requestedLifetimeCount: 100,
            requestedMaxKeepAliveCount: 10,
            maxNotificationsPerPublish: 100,
            publishingEnabled: true,
            priority: 10
        });

        subscription
            .on("started", function() {
                console.log(
                    "subscription started for 2 seconds - subscriptionId=",
                    subscription.subscriptionId
                );
            })
            .on("keepalive", function() {
                console.log("keepalive");
            })
            .on("terminated", function() {
                console.log("terminated");
            });

// set subscribed (monitored) item


        //monitor oven power status
        let ovenPowerStatIDPtr = getIDOvenPowerStatus()
        let ovenPowerStatID = __getString(ovenPowerStatIDPtr)
        console.log(ovenPowerStatID)
        const ovenPowerMonitor: ReadValueIdOptions = {
            nodeId: __getString(ovenPowerStatIDPtr),
            attributeId: AttributeIds.Value
        };

        const parameters: MonitoringParametersOptions = {
            samplingInterval: 100,
            discardOldest: true,
            queueSize: 10
        };

        const ovenPower = ClientMonitoredItem.create(
            subscription,
            ovenPowerMonitor,
            parameters,
            TimestampsToReturn.Both
        );

        //monitor the oven's door. false: the door does not move now
        let ovenDoorIDPtr = getIDOvenDoorStatus()
        const doorMonitor: ReadValueIdOptions = {
            nodeId: __getString(ovenDoorIDPtr),
            attributeId: AttributeIds.Value
        };

        const ovenDoor = ClientMonitoredItem.create(
            subscription,
            doorMonitor,
            parameters,
            TimestampsToReturn.Both
        )

        //TODO:check here bake time
        /*
        * Depending on the temperature, decide if the baking time is appropriate.
        * Then send the information via MQTT.
        * This message should be received by a RasPi/ESP at the conveyor or vacuum lifter.
        * The receiver sends a remove command if the corresponding product is defect
        * */

        // Assume that an item will be inserted or removed if the door opens.
        ovenDoor.on("changed", (dataValue, DataValue)=>{
            console.log('door is moving', dataValue.value.value);
           if(dataValue.value.value){
               if(isItemInOven){
                   //TODO:send mqtt message
                   //Check if WASM function runs as intended
                   bakingTimeError = !isBakingTimeAcceptable(definedBakeTime.value.value, totalBakingTime);
                   //Create messages (JSON) and send them via MQTT (topic: oven status)
                   mqttMsg = {
                       "baking_time_error": bakingTimeError, //boolean
                       "time": totalBakingTime, // number.
                       "interrupted": bakingInterrupted
                   }

                   mqttClient.publish('baking_status', JSON.stringify(mqttMsg))//JSON Format

                   //oven is free now
                   isItemInOven = false;
               }
               else{
                   totalBakingTime = 0;
                   bakingInterrupted = false;
                   isItemInOven = true;
               }

           }
        });

        ovenPower.on("changed", async (dataValue: DataValue) => {

            console.log(" value has changed (oven turns on/off) : ", dataValue.value.value.toString());
            //Listen to the oven door status. When an item will enter into the oven, it stores the current time.
            //monitor the oven's door. false: the door does not move now(??)
            if(!dataValue.value.value){
                if(isItemInOven){
                    bakingTime = await session.read({
                        nodeId: 'ns=3;s="PRG_MPO_Ablauf_DB"."Oven_TON".ET',
                        attributeId: AttributeIds.Value
                    });

                    //totalBakingTime != 0 means that the oven has turned off and on again between baking a single item.
                    if(totalBakingTime!=0){
                        bakingInterrupted = true;
                    }
                    totalBakingTime += bakingTime.value.value;
                }
            }

        });


        //TODO: Terminate subscription only if there is an error
        //console.log("now terminating subscription");
        //await subscription.terminate();

        // close session
        //await session.close();

        // disconnecting
        //await client.disconnect();
        //console.log("done !");
    } catch(err) {
        console.log("An error has occured : ",err);
    }
}


main();


