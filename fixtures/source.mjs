export const seed={
  "instanceId": "i1",
  "formVersion": "f1",
  "revision": 1,
  "answers": {
    "site": "plot1",
    "count": 2
  }
};
export const seedPath="/submission";
export const routes=[
  {
    "path": "/submissions",
    "body": {
      "items": [
        {
          "instanceId": "i1",
          "formVersion": "f1",
          "revision": 1,
          "url": "/instances/i1"
        }
      ]
    },
    "method": "GET",
    "status": 200,
    "query": {},
    "headers": {}
  },
  {
    "path": "/forms/f1",
    "body": {
      "fields": [
        {
          "path": "hasWater",
          "repeat": false
        },
        {
          "path": "depth",
          "relevant": "hasWater = true",
          "repeat": false
        },
        {
          "path": "samples",
          "repeat": true
        }
      ],
      "mediaRequirements": [
        "photo"
      ]
    },
    "method": "GET",
    "status": 200,
    "query": {},
    "headers": {}
  },
  {
    "path": "/instances/i1",
    "body": {
      "instanceId": "i1",
      "formVersion": "f1",
      "revision": 1,
      "answers": {
        "hasWater": false
      },
      "askedPaths": [
        "hasWater",
        "samples[r1]/weight"
      ],
      "repeats": [
        {
          "instanceKey": "r1",
          "answers": {
            "weight": null
          }
        },
        {
          "instanceKey": "r2",
          "answers": {
            "weight": 2
          }
        }
      ],
      "deletedRepeatIds": [],
      "media": [
        {
          "name": "photo",
          "status": "pending"
        }
      ]
    },
    "method": "GET",
    "status": 200,
    "query": {},
    "headers": {}
  }
];
export const phases={
  "media-late": [
    {
      "path": "/instances/i1",
      "body": {
        "instanceId": "i1",
        "formVersion": "f1",
        "revision": 1,
        "answers": {
          "hasWater": false
        },
        "askedPaths": [
          "hasWater",
          "samples[r1]/weight"
        ],
        "repeats": [
          {
            "instanceKey": "r1",
            "answers": {
              "weight": null
            }
          },
          {
            "instanceKey": "r2",
            "answers": {
              "weight": 2
            }
          }
        ],
        "deletedRepeatIds": [],
        "media": [
          {
            "name": "photo",
            "status": "available",
            "url": "/media/photo"
          }
        ]
      },
      "method": "GET",
      "status": 200,
      "query": {},
      "headers": {}
    },
    {
      "path": "/media/photo",
      "body": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
      "method": "GET",
      "status": 200,
      "query": {},
      "headers": {
        "content-type": "image/png"
      },
      "encoding": "base64"
    }
  ],
  "media-broken": [
    {
      "path": "/instances/i1",
      "body": {
        "instanceId": "i1",
        "formVersion": "f1",
        "revision": 1,
        "answers": {
          "hasWater": false
        },
        "askedPaths": [
          "hasWater",
          "samples[r1]/weight"
        ],
        "repeats": [
          {
            "instanceKey": "r1",
            "answers": {
              "weight": null
            }
          },
          {
            "instanceKey": "r2",
            "answers": {
              "weight": 2
            }
          }
        ],
        "deletedRepeatIds": [],
        "media": [
          {
            "name": "photo",
            "status": "available",
            "url": "/media/absent"
          }
        ]
      },
      "method": "GET",
      "status": 200,
      "query": {},
      "headers": {}
    }
  ],
  "media-unreported": [
    {
      "path": "/instances/i1",
      "body": {
        "instanceId": "i1",
        "formVersion": "f1",
        "revision": 1,
        "answers": {
          "hasWater": false
        },
        "askedPaths": [
          "hasWater",
          "samples[r1]/weight"
        ],
        "repeats": [
          {
            "instanceKey": "r1",
            "answers": {
              "weight": null
            }
          },
          {
            "instanceKey": "r2",
            "answers": {
              "weight": 2
            }
          }
        ],
        "deletedRepeatIds": [],
        "media": []
      },
      "method": "GET",
      "status": 200,
      "query": {},
      "headers": {}
    }
  ],
  "revision": [
    {
      "path": "/instances/i1",
      "body": {
        "instanceId": "i1",
        "formVersion": "f1",
        "revision": 2,
        "answers": {
          "hasWater": false
        },
        "askedPaths": [
          "hasWater",
          "samples[r2]/weight"
        ],
        "repeats": [
          {
            "instanceKey": "r2",
            "answers": {
              "weight": 2
            }
          }
        ],
        "deletedRepeatIds": [
          "r1"
        ],
        "media": [
          {
            "name": "photo",
            "status": "available",
            "url": "/media/photo"
          }
        ]
      },
      "method": "GET",
      "status": 200,
      "query": {},
      "headers": {}
    },
    {
      "path": "/media/photo",
      "body": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
      "method": "GET",
      "status": 200,
      "query": {},
      "headers": {
        "content-type": "image/png"
      },
      "encoding": "base64"
    }
  ],
  "form-upgrade": [
    {
      "path": "/forms/f2",
      "body": {
        "fields": [
          {
            "path": "hasWater",
            "repeat": false
          },
          {
            "path": "depth",
            "relevant": "always",
            "repeat": false
          }
        ],
        "mediaRequirements": []
      },
      "method": "GET",
      "status": 200,
      "query": {},
      "headers": {}
    },
    {
      "path": "/submissions",
      "body": {
        "items": [
          {
            "instanceId": "i1",
            "formVersion": "f1",
            "revision": 1,
            "url": "/instances/i1"
          },
          {
            "instanceId": "i2",
            "formVersion": "f2",
            "revision": 1,
            "url": "/instances/i2"
          }
        ]
      },
      "method": "GET",
      "status": 200,
      "query": {},
      "headers": {}
    },
    {
      "path": "/instances/i2",
      "body": {
        "instanceId": "i2",
        "formVersion": "f2",
        "revision": 1,
        "answers": {
          "hasWater": false,
          "depth": null
        },
        "askedPaths": [
          "hasWater",
          "depth"
        ],
        "repeats": [],
        "deletedRepeatIds": [],
        "media": []
      },
      "method": "GET",
      "status": 200,
      "query": {},
      "headers": {}
    }
  ]
};
export const portalKind="";
