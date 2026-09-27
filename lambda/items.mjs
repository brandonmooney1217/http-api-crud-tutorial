// ============================================================
// Lambda Handler — Your L7 Application Code
//
// API Gateway does the "edge" L7 work before this code runs:
//   1. Accepts the TCP connection (L4)
//   2. Parses the raw HTTP request (L7)
//   3. Matches the route (e.g., GET /items/{id})
//   4. Packages everything into the `event` object below
//
// Your job: read the event, do business logic, return an HTTP response.
// ============================================================

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  GetCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);
const tableName = "http-crud-tutorial-items";

export const handler = async (event) => {
  // ============================================================
  // THE HTTP RESPONSE — L7's fundamental structure
  //
  // Every HTTP response has three parts:
  //   1. Status code — 200 OK, 400 Bad Request, etc.
  //   2. Headers     — metadata (Content-Type tells client it's JSON)
  //   3. Body        — the actual data
  //
  // L3/L4 don't know about any of this. They just move bytes.
  // Only L7 understands "this is a 200 OK with a JSON body."
  // ============================================================
  let body;
  let statusCode = 200;
  const headers = {
    "Content-Type": "application/json",
  };

  try {
    switch (event.routeKey) {
      // ============================================================
      // GET /items/{id} — Read a single resource
      //
      // PATH PARAMETERS: when the client sends GET /items/abc123,
      // API Gateway sees that {id} in the route definition and
      // extracts "abc123" into event.pathParameters.id
      //
      // This is L7 routing — the URL path has MEANING.
      // L3 just sees an IP address. L4 just sees port 443.
      // L7 understands that /items/abc123 means "get item abc123."
      // ============================================================
      case "GET /items/{id}":
        body = await dynamo.send(
          new GetCommand({
            TableName: tableName,
            Key: { id: event.pathParameters.id },
          })
        );
        body = body.Item;
        break;

      // ============================================================
      // PUT /items — Create or update an item
      //
      // REQUEST BODY: the client sends JSON in the HTTP body:
      //   {"id": "123", "price": 100, "name": "widget"}
      //
      // JSON.parse() turns that raw string into a JS object.
      // This is purely L7 — L3 moved packets, L4 delivered bytes
      // reliably, but only L7 knows those bytes are a JSON object.
      //
      // PUT is idempotent: calling it twice with the same data
      // produces the same result (unlike POST, which would create
      // a duplicate each time).
      // ============================================================
      case "PUT /items":
        let requestJSON = JSON.parse(event.body);
        await dynamo.send(
          new PutCommand({
            TableName: tableName,
            Item: {
              id: requestJSON.id,
              price: requestJSON.price,
              name: requestJSON.name,
            },
          })
        );
        body = `Put item ${requestJSON.id}`;
        break;

      default:
        throw new Error(`Unsupported route: "${event.routeKey}"`);
    }
  } catch (err) {
    statusCode = 400;
    body = err.message;
  } finally {
    body = JSON.stringify(body);
  }

  return {
    statusCode,
    body,
    headers,
  };
};
