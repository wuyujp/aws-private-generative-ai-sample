const { EC2Client, DescribeAvailabilityZonesCommand } = require("@aws-sdk/client-ec2");

const updateStatus = async (event, status, reason, physicalResourceId, az1, az2) => {
  const body = JSON.stringify({
    Status: status,
    Reason: reason,
    PhysicalResourceId: physicalResourceId,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    NoEcho: false,
    Data: {az1 : az1, az2 : az2},
  });

  const res = await fetch(event.ResponseURL, {
    method: 'PUT',
    body,
    headers: {
      'Content-Type': '',
      'Content-Length': body.length.toString(),
    },
  });

  // 失敗時の記録のために残す
  console.log(res);
  console.log(await res.text());
};

exports.handler = async (event, context) => {
  // 失敗時の記録のために残す
  console.log(event);
  const physicalResourceId =
      '53cde921-d2fd-29f6-a873-d8b6edbbc451' || event.PhysicalResourceId;
  const result = await getAzNames();

  try {
    switch (event.RequestType) {
      case 'Create':
        await updateStatus(
          event,
          'SUCCESS',
          'Successfully created',
          physicalResourceId,
          result[0],
          result[1],
        );
        break;
      case 'Update':
        await updateStatus(
          event,
          'SUCCESS',
          'Update operation is not supported',
          physicalResourceId,
          'NORESULT',
          'NORESULT',
        );
        break;
      case 'Delete':
        await updateStatus(event, 'SUCCESS', 'Delete operation is not supported',physicalResourceId, 'NORESULT','NORESULT',);
        break;
    }
  } catch (e) {
    console.log('---- Error');
    console.log(e);

    await updateStatus(event, 'FAILED', e.message, physicalResourceId);
  }
};



async function getAzNames() {
    
    // 利用可能なAZを取得
    const ec2Client = new EC2Client();
    const command = new DescribeAvailabilityZonesCommand({});
    const response = await ec2Client.send(command);

    
    const azList = [];
    for (const az of response.AvailabilityZones) {
        const zoneId = az.ZoneId;
        const zoneName = az.ZoneName;
        
        if (zoneId.endsWith('az1')) {
            azList.push(zoneName);
        } else if (zoneId.endsWith('az2')) {
            azList.push(zoneName);
        }
        
        if (azList.length === 2) {
            break;
        }
    }
    
    return azList;
}