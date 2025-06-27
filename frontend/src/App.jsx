import React, { useState } from "react";
import {
  Button,
  Typography,
  Space,
  message,
  Form,
  Input,
  Select,
  Divider,
  Alert,
  Flex,
} from "antd";
import axios from "axios";

const { Title } = Typography;

const pingBackend = async () => {
  try {
    const res = await axios.get("/api/ping");
    message.success(res.data.message);
  } catch (e) {
    message.error("Ошибка запроса к бэкенду");
  }
};

const generateCommand = (preview) => {
  let base = `zap-baseline.py -t ${preview.url}`;

  if (preview.options) base += ` ${preview.options}`;

  return base;
};

const initialValues = {
  url: "",
};

const App = () => {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [preview, setPreview] = useState(initialValues);
  const [sendResult, setSendResult] = useState(null);

  // Обновлять превью при каждом изменении
  const handleValuesChange = (changed, all) => {
    setPreview(all);
  };

  const onFinish = async (values) => {
    const cmd = generateCommand(values);

    setLoading(true);
    setSendResult(null);
    try {
      const res = await axios.post("/api/zap/run", {
        command: cmd,
      });
      setSendResult({
        type: "success",
        msg: res.data?.message || "Успешно отправлено",
      });

      if (res.data?.output) {
        setSendResult({
          type: "success",
          msg: res.data?.output,
        });
      }
    } catch (e) {
      setSendResult({
        type: "error",
        msg:
          e.response?.data?.error ||
          e.response?.data?.message ||
          "Ошибка отправки",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Flex vertical style={{ padding: 40 }}>
      <Flex align="start" justify="space-between">
        <Title>VKR Web Security Stand</Title>
        <Button type="primary" onClick={pingBackend}>
          Пинг бэкенда
        </Button>
      </Flex>
      <Flex vertical>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          onValuesChange={handleValuesChange}
          initialValues={initialValues}
        >
          <Form.Item
            label="URL для тестирования"
            name="url"
            rules={[{ required: true, message: "Введите URL" }]}
          >
            <Input
              placeholder="https://example.com"
              style={{ maxWidth: "50%" }}
            />
          </Form.Item>

          <Divider>ZAP (OWASP)</Divider>

          <Space direction="vertical">
            <Form.Item label="Доп. опции (необязательно)" name="options">
              <Input placeholder="--some-flag value" />
            </Form.Item>

            <Form.Item label="Запустить команду">
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                disabled={loading}
              >
                {generateCommand(preview)}
              </Button>
            </Form.Item>
          </Space>
        </Form>
        {sendResult && (
          <Alert
            style={{ marginTop: 16 }}
            message={sendResult.msg}
            type={sendResult.type}
            showIcon
          />
        )}
        {/* </>
      )} */}
      </Flex>
    </Flex>
  );
};

export default App;
