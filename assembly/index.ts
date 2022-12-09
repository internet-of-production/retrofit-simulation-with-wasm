const mqttOptionJSON:string = "{\"clientId\":\"wasmNode\",\"port\":8883,\"host\":\"localhost\",\"username\":\"wasmretrofitting\",\"password\":\"wasmretrofitting\",\"protocol\": \"mqtt\",\"reconnectPeriod\":1000}"
const opcuaIDOvenPowerStatus:string = ""
const opcuaIDBakingTime:string = ""
const opcuaIDBakingElapsedTime:string = ""
const opcuaIDOvenDoorStatus:string = ""

const airConditionerTempID = 'ns=3;s=AirConditioner_1.Temperature'
// AssemblyScript

export function getIDAirConditionerTemp():string {
  return airConditionerTempID
}