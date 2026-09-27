import * as cdk from 'aws-cdk-lib/core';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Construct } from 'constructs';

export class HttpApiCrudTutorialStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ============================================================
    // STEP 1: DynamoDB Table — The data store
    //
    // A simple key-value table. Each item has a unique `id`.
    //
    // Unlike EC2 instances in the VPC lab, DynamoDB has NO VPC,
    // NO subnets, NO security groups. It's a managed service
    // accessed entirely over HTTPS (L7). Your Lambda will talk
    // to it by sending HTTP requests with JSON payloads —
    // PutItem, GetItem, DeleteItem, Scan.
    //
    // Even database access is L7 at this level.
    // ============================================================
    const table = new dynamodb.Table(this, 'ItemsTable', {
      tableName: 'http-crud-tutorial-items',
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ============================================================
    // STEP 2: Lambda Function — The L7 application logic
    //
    // This is your "server" — but unlike EC2 in the VPC lab,
    // it's serverless. No VPC, no subnets, no security groups.
    //
    // The function handles L7 work: parsing HTTP requests,
    // routing to CRUD operations, formatting HTTP responses.
    // ============================================================
    const itemsFunction = new lambda.Function(this, 'ItemsFunction', {
      functionName: 'http-crud-tutorial-function',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'items.handler',              // file: items.mjs, export: handler
      code: lambda.Code.fromAsset('lambda'), // directory containing items.mjs
    });

    // Give Lambda permission to read/write the DynamoDB table
    table.grantReadWriteData(itemsFunction);

    // ============================================================
    // STEP 3: HTTP API Gateway — The L7 entry point
    //
    // This is a managed, serverless L7 reverse proxy. It does the
    // same job as the ALB from the VPC lab:
    //
    //   1. Accept incoming HTTP requests from the internet
    //   2. Parse method, path, headers, body (L7 understanding)
    //   3. Match to a route (GET /items, PUT /items, etc.)
    //   4. Forward to a backend (Lambda in our case)
    //   5. Return the response to the client
    //
    // Key difference from ALB:
    //   ALB:         lives in your VPC, needs subnets + security groups
    //   HTTP API:    fully managed, no VPC needed, pay-per-request
    //
    // Both operate at L7 — they understand HTTP, not just TCP.
    // ============================================================
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'http-crud-tutorial-api',
    });

    // ============================================================
    // STEP 4: Integration + Routes — Wiring it together
    //
    // An "integration" tells API Gateway: "when a route matches,
    // invoke this Lambda function."
    //
    // A "route" combines HTTP METHOD + PATH:
    //   GET /items/{id}  →  "read item with this ID"
    //   PUT /items       →  "create/update an item"
    //
    // This is L7 ROUTING vs L3/L4 routing:
    //   L3 route table:   destination IP → next hop
    //   L4 security group: port + protocol + source → allow/deny
    //   L7 API Gateway:   HTTP method + URL path → invoke Lambda
    //
    // The deeper the layer, the more context for routing decisions.
    // ============================================================
    const lambdaIntegration = new integrations.HttpLambdaIntegration(
      'LambdaIntegration',
      itemsFunction,
    );

    // GET /items/{id} — read a single item
    httpApi.addRoutes({
      path: '/items/{id}',
      methods: [apigwv2.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    // PUT /items — create or update an item
    httpApi.addRoutes({
      path: '/items',
      methods: [apigwv2.HttpMethod.PUT],
      integration: lambdaIntegration,
    });

    // ============================================================
    // OUTPUT: The public HTTPS URL for your API
    //
    // API Gateway enforces TLS by default — every request is
    // encrypted. This is the "S" in HTTPS, sitting between
    // L4 (TCP) and L7 (HTTP).
    // ============================================================
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: httpApi.apiEndpoint,
      description: 'HTTP API endpoint URL — use this with curl to test',
    });
  }
}
