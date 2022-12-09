# retrofit-simulation-with-wasm
A prototype for retrofitting training factory with WebAssembly (WASM). This project aims to realize a more flexible mean for retrofitting industrial machinaries with a portable Web-binary format, WASM. 

## Overview
A PC like RaspberryPi can run this program and read data via OPCUA. This data will be analyzed, and it will send the result as MQTT-messages. In this example, it reads data from our training factory and calculates difference between measured and defined baking time. Configuration for OPCUA-client and MQTT-client is given by WASM. Besides, the check-function for baking time is written in WASM. You can find the AssemblyScript code [here](./assembly/index.ts).
