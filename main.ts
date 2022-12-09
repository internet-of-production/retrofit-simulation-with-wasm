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
    DataValue
} from "node-opcua";

const loader = require("@assemblyscript/loader");
const fs = require("fs");
const mqtt = require('mqtt')

//One can add JS functions that are called in Wasm in imports
const imports = { /* imports go here */ };
const wasmModule = loader.instantiateSync(fs.readFileSync(__dirname + "/build/release.wasm"), imports);
module.exports = wasmModule.exports; //module.exports refers exports property of wasmModule. It allows us to use a wasmModule like a JSModule.

const {getIDAirConditionerTemp, getMQTTOptions, checkBakingTime} = module.exports
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
// const endpointUrl = "opc.tcp://opcuademo.sterfive.com:26543";
const endpointUrl = "opc.tcp://opcuaserver.com:48010";
//const endpointUrl = "opc.tcp://192.168.0.1:4840";//address of opc server at mock factory

let isItemInOven = false;
let bakingStart;
let bakingEnd;
let timeLength;
let definedBakeTime;
let bakingTimeError = false;
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
        const dataValue2 = await session.read({
            //nodeId: 'ns=3;s="QX_MPO_LightOven_Q9"',//Ist Ofen an? semi colon aufpassen
            nodeId: 'ns=3;s=AirConditioner_1.Temperature',
            attributeId: AttributeIds.Value
        });
        console.log(" dataValue2 = ", dataValue2.toString());

        //Get the expected baking time length
        /*definedBakeTime = await session.read({
            nodeId: 'ns=3;s="PRG_MPO_Ablauf_DB"."Bake_Time"',
            attributeId: AttributeIds.Value
        });
        console.log(" expectedBakeTime = ", definedBakeTime.toString());*/

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

        let airCondIDPtr = getIDAirConditionerTemp()
        console.log('wasm called')
        let airCondID = __getString(airCondIDPtr)
        console.log(airCondID)
        const itemToMonitor: ReadValueIdOptions = {
            //nodeId: 'ns=3;s=AirConditioner_1.Temperature',
            nodeId: __getString(airCondIDPtr),
            attributeId: AttributeIds.Value
        };

        /*
        //monitor the oven's door. false: the door does not move now(??)
        const itemToMonitor: ReadValueIdOptions = {
            nodeId: 'ns=3;s="QX_MPO_ValveOvenDoor_Q13"',
            attributeId: AttributeIds.Value
        };
        */

        const parameters: MonitoringParametersOptions = {
            samplingInterval: 100,
            discardOldest: true,
            queueSize: 10
        };

        const monitoredItem = ClientMonitoredItem.create(
            subscription,
            itemToMonitor,
            parameters,
            TimestampsToReturn.Both
        );

        //TODO:check here the time and temperature of the oven
        /*
        * Depending on the temperature, decide if the baking time is appropriate.
        * Then send the information via MQTT.
        * This message should be received by a RasPi/ESP at the conveyor or vacuum lifter.
        * The receiver sends a remove command if the corresponding product is defect
        * */
        monitoredItem.on("changed", (dataValue: DataValue) => {
            console.log(" value has changed : ", dataValue.value.value.toString());
            //Listen to the oven door status. When an item will enter into the oven, it stores the current time.
            //monitor the oven's door. false: the door does not move now(??)
            if(dataValue.value.value){
                if(!isItemInOven){
                    //set current time. Is time given in ms?
                    bakingStart = session.read({
                        nodeId: 'ns=3;s="PRG_MPO_Ablauf_DB"."Oven_TON".ET',
                        attributeId: AttributeIds.Value
                    });
                    isItemInOven = true;
                }
                else{
                    //When an item is already in the oven, it calculates the time difference and compare with the desired time.
                    bakingEnd = session.read({
                        nodeId: 'ns=3;s="PRG_MPO_Ablauf_DB"."Oven_TON".ET',
                        attributeId: AttributeIds.Value
                    });
                    //Check also if the oven is running or not.　How precise should be the time??
                    timeLength = bakingEnd - bakingStart

                    //TODO: Check if WASM function runs as intended
                    bakingTimeError = checkBakingTime(definedBakeTime, timeLength);
                    //TODO:Create messages (JSON) and send them via MQTT (topic: oven status)
                    mqttMsg = {
                        "baking_time_error": bakingTimeError, //boolean
                        "time": timeLength // number.
                    }

                    mqttClient.publish('baking_status', JSON.stringify(mqttMsg))//JSON Format

                    //oven is free now
                    isItemInOven = false;
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


