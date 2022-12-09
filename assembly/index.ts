
const acceptableErrorRange = 0.1 //10 percent

const mqttOptionJSON:string = "{\"clientId\":\"wasmNode\",\"port\":1883,\"host\":\"localhost\",\"rejectUnauthorized\":false,\"protocol\": \"mqtt\",\"reconnectPeriod\":1000}"
const opcuaIDOvenPowerStatus:string = ""
const opcuaIDBakingTime:string = ""
const opcuaIDBakingElapsedTime:string = ""
const opcuaIDOvenDoorStatus:string = ""

//test ID
const airConditionerTempID = 'ns=3;s=AirConditioner_1.Temperature'

export function getIDAirConditionerTemp():string {
  return airConditionerTempID
}

export function getMQTTOptions():string{
  return mqttOptionJSON
}

export function checkBakingTime(definedTime:i32, eleapsedTime:i32):boolean{
  return Math.abs(definedTime-eleapsedTime)/definedTime <= acceptableErrorRange
}