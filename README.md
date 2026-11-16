# 野外调查答卷的跳题路径与重复组采集

野外调查资料接收服务。按表单修订领取完整答卷：逐版本登记表单定义、来源当时的路径记录、按实例键保持身份的重复组和现场附件状态，并按已确认、等待资料、需人工核对区分答卷。

## 运行

使用 Node.js 22，依赖由 package-lock.json 固定。安装后可执行：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run demo
npm start
```

服务启动本地来源与收件接口，默认端口分别为4011和4010。`POST /collect` 领取来源清单内全部答卷；`GET /records`查看结构化记录，可用`?status=`按已确认、等待资料、需人工核对过滤；`GET /receipts`查看原文凭据；`GET /objects/:hash`取回附件等归档原文；`GET /health`查看服务状态。`PORT`、`SOURCE_PORT`与`DATA_DIR`可分别设置端口和归档目录。示例领取不会自动遍历其他来源资料。

```sh
docker build -t field-form-paths .
docker run --rm --network none field-form-paths npm test
docker run --rm --network none field-form-paths npm run demo
docker run --rm -p 4010:4010 field-form-paths
```

## 资料组织

`provider/`是独立本地来源，`fixtures/`记录合成资料和来源阶段，`src/reader.mjs`负责领取清单、按表单版本解释答卷并登记附件，`src/source.mjs`限定来源地址并记录响应字节，`src/archive.mjs`保存按摘要校验的原文与资料版本。`test/`覆盖收件解释、来源边界、原文完整性和服务联通。运行不依赖外网、数据库服务或真实设备。

每条记录保留：答卷原始答案与当时的路径记录（`askedPaths`，不由接收端重算跳题）、该修订所用表单版本的定义原文、按实例键登记的重复组与来源给出的删组标识、附件状态与已归档附件的摘要、以及所依据的来源凭据标识。空白只区分为未提问、提问未答或重复组已删除，空值保持原样，不统一填空字符串；等待中的附件不写成没有拍照。记录随归档持久化，跨重启仍可分辨已确认、等待资料与需人工核对的答卷。

完整来源约定见 `docs/source-contract.md`。项目只访问本地合成资料，不携带真实身份、密钥或业务数据。

## 快速查看

`npm run demo`启动实际来源和收件服务、执行一次当前收件并打印查询结果及凭据，临时归档在退出时清理。正常完成时间小于90秒；需要保留数据时用`npm start`及独立`DATA_DIR`。演示反映当前产品能力，不代表全部来源资料已被接纳。
