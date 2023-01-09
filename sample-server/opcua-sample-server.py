#reference: https://github.com/FreeOpcUa/python-opcua/blob/master/examples/server-example.py

import uuid
from threading import Thread
import copy
import logging
from datetime import datetime
import time
from math import sin
import sys

from opcua.ua import NodeId, NodeIdType
import random

sys.path.insert(0, "..")

try:
    from IPython import embed
except ImportError:
    import code

    def embed():
        myvars = globals()
        myvars.update(locals())
        shell = code.InteractiveConsole(myvars)
        shell.interact()

from opcua import ua, uamethod, Server


class SubHandler(object):
    """
    Subscription Handler. To receive events from server for a subscription
    """

    def datachange_notification(self, node, val, data):
        print("Python: New data change event", node, val)

    def event_notification(self, event):
        print("Python: New event", event)


# method to be exposed through server

def func(parent, variant):
    ret = False
    if variant.Value % 2 == 0:
        ret = True
    return [ua.Variant(ret, ua.VariantType.Boolean)]


# method to be exposed through server
# uses a decorator to automatically convert to and from variants

@uamethod
def multiply(parent, x, y):
    print("multiply method call with parameters: ", x, y)
    return x * y

'''
class VarUpdater(Thread):
    def __init__(self, var):
        Thread.__init__(self)
        self._stopev = False
        self.var = var

    def stop(self):
        self._stopev = True

    def run(self):
        while not self._stopev:
            v = sin(time.time() / 10)
            self.var.set_value(v)
            time.sleep(0.1)
'''

# Update oven's values 
class ElapsedTimeUpdater(Thread):

    def __init__(self, var):
        Thread.__init__(self)
        self._stopev = False
        self.var = var

    def stop(self):
        self._stopev = True

    def run(self):
        while not self._stopev:
            self.var.set_value(random.randint(240000,360000), ua.VariantType.Int32)
            time.sleep(1)

class OvenDoorPowerUpdater(Thread):
    def __init__(self, door, power):
        Thread.__init__(self)
        self._stopev = False
        self.door = door
        self.power = power

    def stop(self):
        self._stopev = True

    # assume that baking will not be interrupted
    def run(self):
        while not self._stopev:
            self.door.set_value(True)  # door opens
            time.sleep(2)
            self.door.set_value(False) # door closes
            time.sleep(2)
            self.power.set_value(True) # oven turns on
            time.sleep(10) # 10 seconds. bake time in a real case
            self.power.set_value(False) # oven turns off
            time.sleep(2)
            self.door.set_value(True)  # door opens
            time.sleep(2)
            self.door.set_value(False) # door closes
            time.sleep(5)


if __name__ == "__main__":
    # optional: setup logging
    logging.basicConfig(level=logging.WARN)
    #logger = logging.getLogger("opcua.address_space")
    # logger.setLevel(logging.DEBUG)
    #logger = logging.getLogger("opcua.internal_server")
    # logger.setLevel(logging.DEBUG)
    #logger = logging.getLogger("opcua.binary_server_asyncio")
    # logger.setLevel(logging.DEBUG)
    #logger = logging.getLogger("opcua.uaprocessor")
    # logger.setLevel(logging.DEBUG)

    # now setup our server
    server = Server()
    #server.disable_clock()
    #server.set_endpoint("opc.tcp://localhost:4840/freeopcua/server/")
    server.set_endpoint("opc.tcp://0.0.0.0:4840/freeopcua/server/")
    server.set_server_name("FreeOpcUa Example Server")
    # set all possible endpoint policies for clients to connect through
    server.set_security_policy([
                ua.SecurityPolicyType.NoSecurity,
                ua.SecurityPolicyType.Basic256Sha256_SignAndEncrypt,
                ua.SecurityPolicyType.Basic256Sha256_Sign])

    # setup our own namespace
    uri = "http://examples.freeopcua.github.io"
    idx = server.register_namespace(uri)

    # create a new node type we can instantiate in our address space
    dev = server.nodes.base_object_type.add_object_type(idx, "MyDevice")
    dev.add_variable(idx, "sensor1", 1.0).set_modelling_rule(True)
    dev.add_property(idx, "device_id", "0340").set_modelling_rule(True)
    ctrl = dev.add_object(idx, "controller")
    ctrl.set_modelling_rule(True)
    ctrl.add_property(idx, "state", "Idle").set_modelling_rule(True)

    # populating our address space

    # First a folder to organise our nodes
    myfolder = server.nodes.objects.add_folder(idx, "myEmptyFolder")
    # instanciate one instance of our device
    mydevice = server.nodes.objects.add_object(idx, "Device0001", dev)
    mydevice_var = mydevice.get_child(["{}:controller".format(idx), "{}:state".format(idx)])  # get proxy to our device state variable 
    # create directly some objects and variables
    myobj = server.nodes.objects.add_object(idx, "MyObject")
    myvar = myobj.add_variable(idx, "MyVariable", 6.7)
    mysin = myobj.add_variable(idx, "MySin", 0, ua.VariantType.Float)
    myvar.set_writable()    # Set MyVariable to be writable by clients
    mystringvar = myobj.add_variable(idx, "MyStringVariable", "Really nice string")
    mystringvar.set_writable()  # Set MyVariable to be writable by clients
    myguidvar = myobj.add_variable(NodeId(uuid.UUID('1be5ba38-d004-46bd-aa3a-b5b87940c698'), idx, NodeIdType.Guid),
                                   'MyStringVariableWithGUID', 'NodeId type is guid')
    mydtvar = myobj.add_variable(idx, "MyDateTimeVar", datetime.utcnow())
    mydtvar.set_writable()    # Set MyVariable to be writable by clients
    myarrayvar = myobj.add_variable(idx, "myarrayvar", [6.7, 7.9])
    myarrayvar = myobj.add_variable(idx, "myStronglytTypedVariable", ua.Variant([], ua.VariantType.UInt32))
    myprop = myobj.add_property(idx, "myproperty", "I am a property")
    mymethod = myobj.add_method(idx, "mymethod", func, [ua.VariantType.Int64], [ua.VariantType.Boolean])
    multiply_node = myobj.add_method(idx, "multiply", multiply, [ua.VariantType.Int64, ua.VariantType.Int64], [ua.VariantType.Int64])

    # oven logs
    oven = server.nodes.objects.add_object(idx, "Oven")
    ovenpower = oven.add_variable(ua.NodeId.from_string('ns=3;s="QX_MPO_LightOven_Q9"'), "Oven Power Status", False, ua.VariantType.Boolean) #add_variable(self, nodeId, name, value, datatype)
    bake_time = oven.add_variable(ua.NodeId.from_string('ns=3;s="PRG_MPO_Ablauf_DB"."Bake_TIme"'), "Expected Bake Time", 300000, ua.VariantType.Int32) #300000ms (5 min)
    elapsed_time = oven.add_variable(ua.NodeId.from_string('ns=3;s="PRG_MPO_Ablauf_DB"."Oven_TON".ET'), "Elapsed Time", 300000, ua.VariantType.Int32) # start counting if the oven turns ON.
    ovendoor = oven.add_variable(ua.NodeId.from_string('ns=3;s="QX_MPO_ValveOvenDoor_Q13"'), "Oven Door", False, ua.VariantType.Boolean) #oven's door

    # import some nodes from xml
    # server.import_xml("custom_nodes.xml")

    # creating a default event object
    # The event object automatically will have members for all events properties
    # you probably want to create a custom event type, see other examples
    myevgen = server.get_event_generator()
    myevgen.event.Severity = 300
    
    # starting!
    server.start()
    print("Available loggers are: ", logging.Logger.manager.loggerDict.keys())
    oven_door_power_update = OvenDoorPowerUpdater(ovendoor, ovenpower)
    oven_door_power_update.start()
    elapsed_t_update = ElapsedTimeUpdater(elapsed_time) 
    elapsed_t_update.start()
    try:
        # enable following if you want to subscribe to nodes on server side
        #handler = SubHandler()
        #sub = server.create_subscription(500, handler)
        #handle = sub.subscribe_data_change(myvar)
        # trigger event, all subscribed clients wil receive it
        var = myarrayvar.get_value()  # return a ref to value in db server side! not a copy!
        var = copy.copy(var)  # WARNING: we need to copy before writting again otherwise no data change event will be generated
        var.append(9.3)
        myarrayvar.set_value(var)
        mydevice_var.set_value("Running")
        myevgen.trigger(message="This is BaseEvent")
        #server.set_attribute_value(myvar.nodeid, ua.DataValue(9.9))  # Server side write method which is a but faster than using set_value

        embed()
    finally:
        oven_door_power_update.stop()
        elapsed_t_update.stop()
        server.stop()