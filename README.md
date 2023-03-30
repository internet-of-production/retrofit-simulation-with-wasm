# retrofit-simulation-with-wasm
A prototype for retrofitting training factory with WebAssembly (WASM). This project aims to realize a more flexible mean for retrofitting industrial machinaries with a portable Web-binary format, WASM. 

## Overview
A PC like RaspberryPi can run this program and read data via OPC UA. This data will be analyzed, and it will send the result as MQTT-messages. In this example, it reads data from our training factory and calculates difference between measured and defined baking time. Configuration for OPC UA-client and MQTT-client is given by WASM. Besides, the check-function for baking time is written in WASM. You can find the AssemblyScript code [here](./assembly/index.ts).

## Installation
Clone this repository and run `npm install`

## Sample server
You find a OPC UA sample server written in Python [here](./sample-server/opcua-sample-server.py). This implementation requires [`python-opcua`](https://github.com/FreeOpcUa/python-opcua). After installing the opcua library, you can execute the demo server on your PC by running command `python opcua-sample-server.py` in the shell.
