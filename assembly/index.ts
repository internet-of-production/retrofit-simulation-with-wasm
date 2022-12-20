
const acceptableErrorRange = 0.1 //10 percent
//Configuration for mock factory
//const opcEndpointUrl = "opc.tcp://192.168.0.1:4840"
//const mqttOptionJSON:string = "{\"clientId\":\"wasmNode\",\"port\":1883,\"host\":\"192.168.0.10\",\"rejectUnauthorized\":false,\"protocol\": \"mqtt\",\"reconnectPeriod\":1000}"

//Configuration for testing at home
const opcEndpointUrl = "opc.tcp://opcuaserver.com:48010";
const mqttOptionJSON:string = "{\"clientId\":\"wasmNode\",\"port\":1883,\"host\":\"localhost\",\"rejectUnauthorized\":false,\"protocol\": \"mqtt\",\"reconnectPeriod\":1000}"

const opcuaIDOvenPowerStatus:string = 'ns=3;s="QX_MPO_LightOven_Q9"'
const opcuaIDBakingTime:string = 'ns=3;s=\"PRG_MPO_Ablauf_DB\".\"Bake_TIme\"'
const opcuaIDBakingElapsedTime:string = 'ns=3;s="PRG_MPO_Ablauf_DB"."Oven_TON".ET'
const opcuaIDOvenDoorStatus:string = 'ns=3;s="QX_MPO_ValveOvenDoor_Q13"'

//test ID
const airConditionerTempID = 'ns=3;s=AirConditioner_1.Temperature'

export function getIDAirConditionerTemp():string {
  return airConditionerTempID
}

export function getIDOvenPowerStatus():string {
  return opcuaIDOvenPowerStatus
}

export function getIDBakingTime():string {
  return opcuaIDBakingTime
}

export function getIDBakingElapsedTime():string {
  return opcuaIDBakingElapsedTime
}

export function getIDOvenDoorStatus():string {
  return opcuaIDOvenDoorStatus
}

export function getOpcEndpoint(): string{
  return opcEndpointUrl
}

export function getMQTTOptions():string{
  return mqttOptionJSON
}

export function checkBakingTime(definedTime:i32, eleapsedTime:i32):boolean{
  return Math.abs(definedTime-eleapsedTime)/definedTime <= acceptableErrorRange
}