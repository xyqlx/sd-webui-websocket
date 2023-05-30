import time
import torch
from torch import Tensor
import numpy as np
import gradio as gr
from PIL import Image
import modules
from modules.scripts import PostprocessImageArgs
from modules.shared import opts
from modules import scripts, script_callbacks, processing, devices, sd_samplers, sd_samplers_common
from modules import images as Images
from modules.processing import StableDiffusionProcessingTxt2Img, StableDiffusionProcessingImg2Img, Processed
import json
import base64
from io import BytesIO
from typing import Dict

class CustomJSONEncoder(json.JSONEncoder):
    def _convert_objects(self, to_convert):
        new = to_convert
        if isinstance(to_convert, dict):
            new = {}
            for k, v in to_convert.items():
                new[k] = self._convert_objects(v)
        elif isinstance(to_convert, list):
            new = []
            for v in to_convert:
                new.append(self._convert_objects(v))      
        elif isinstance(to_convert, float) and (np.isnan(to_convert) or np.isinf(to_convert)):
            new = str(to_convert)
        elif isinstance(to_convert, Image.Image):
            # PIL.Image.Image to base64
            buffered = BytesIO()
            to_convert.save(buffered, format="PNG")
            imageBase64 = 'data:image/png;base64,' + base64.b64encode(buffered.getvalue()).decode('utf-8')
            new = imageBase64
        return new
    def default(self, obj):
        if (isinstance(obj, StableDiffusionProcessingTxt2Img) or isinstance(obj, StableDiffusionProcessingImg2Img) or isinstance(obj, Processed)) or isinstance(obj, PostprocessImageArgs):
            d = self._convert_objects(obj.__dict__)
            target = {}
            for key in d:
                try:
                    target[key] = json.dumps(d[key])
                    target[key] = d[key]
                except:
                    target[key] = str(d[key])
                    pass
            return target
        if isinstance(obj, Tensor):
            return obj.tolist()
        return json.JSONEncoder.default(self, obj)

class WebSocketExtension(scripts.Script):
    def __init__(self, *k, **kw):
        super().__init__()
        self.to_send_list = []
    def title(self):
        return 'WebSocket'
    def show(self, is_img2img):
        return modules.scripts.AlwaysVisible
    def ui(self, is_img2img):
        elem = 'sd-webui-websocket_' + ('img2img_' if is_img2img else 'txt2img_')
        with gr.Row(elem_id = elem + 'row'):
            with gr.Accordion('WebSocket', open=False, elem_id=elem+'accordion'):
                with gr.Row(elem_id=elem+'route_row'):
                    gr_route = gr.Textbox(label='Route', value='ws://example.com', elem_id=elem+'route', interactive=True)
                    gr_enable = gr.Checkbox(label='Enable', value=lambda: is_img2img, elem_id=elem+'enable', interactive=True)
                with gr.Row(elem_id=elem+'status_row'):
                    gr_status = gr.Chatbot(elem_id=elem+'status')
                with gr.Row(elem_id=elem+'clear_row'):
                    gr_clear = gr.Button(value='Clear', elem_id=elem+'clear', interactive=True)
                with gr.Row(elem_id=elem+'send_row'):
                    gr_send = gr.Textbox(label='Send', value='', elem_id=elem+'send', interactive=True)
                    gr_refresh_btn = gr.Button(value='Refresh', elem_id=elem+'refresh_btn', interactive=True)
                    gr_send_btn = gr.Button(value='Send', elem_id=elem+'send_btn', interactive=True)
                with gr.Row(elem_id=elem+'receive_row'):
                    gr_receive = gr.Textbox(label='Receive', value='', elem_id=elem+'receive', interactive=True)
                    gr_receive_btn = gr.Button(value='Receive', elem_id=elem+'receive_btn', interactive=True)
        gr_enable.change(
            fn=lambda route, enable, status: self.on_enable_change(route, enable, status), inputs=[gr_route, gr_enable, gr_status], outputs=gr_status
        )
        gr_clear.click(
            fn=lambda status: self.on_clear_click(status), inputs=gr_status, outputs=gr_status
        )
        gr_refresh_btn.click(
            fn=lambda send: self.on_refresh_click(send), inputs=gr_send, outputs=gr_send
        )
        gr_send_btn.click(
            fn=lambda send, status: self.on_send_click(send, status), inputs=[gr_send, gr_status], outputs=[gr_send, gr_status]
        )
        gr_receive_btn.click(
            fn=lambda receive, status: self.on_receive_click(receive, status), inputs=[gr_receive, gr_status], outputs=[gr_receive, gr_status]
        )
        return [gr_enable, gr_route, gr_status, gr_send, gr_send_btn, gr_receive, gr_refresh_btn, gr_receive_btn, gr_clear]
    
    def on_enable_change(self, route, enable, status):
        # print('on_enable_change', route, enable)
        # status.append([None, f'{route} {enable}'])
        return status
    
    def on_clear_click(self, status):
        # print('on_clear_click', clear)
        status.clear()
        return status

    def format_line(self, line):
        if len(line) > 100:
            message = json.loads(line)
            id_text = ''
            if 'id' in message:
                id = message['id']
                if isinstance(id, str):
                    id_text = f'"id": "{id}", '
                else:
                    id_text = f'"id": {id}, '
            line = f'''{{ {id_text}"type": "{message['type']}", ... }}'''
        return line

    def on_send_click(self, send, status):
        # print('on_send_click', send)
        if send != '':
            # split lines
            lines = send.split('\n')
            for line in lines:
                status.append([self.format_line(line), None])
        return '', status
    
    def on_refresh_click(self, send):
        # print('on_refresh_click', send)
        if len(self.to_send_list) > 0:
            send += ('' if send == '' else '\n') + '\n'.join(json.dumps(elem, cls = CustomJSONEncoder) for elem in  self.to_send_list)
            self.to_send_list = []
        return send
    
    def on_receive_click(self, receive, status):
        # print('on_receive_click', receive)
        # split lines
        if receive != '':
            lines = receive.split('\n')
            for line in lines:
                if line == '':
                    continue
                status.append([None, self.format_line(line)])
        return '', status

    def process(self, p, gr_enable, *args, **kw):
        if not gr_enable:
            return
        self.to_send_list.append({
            'type': 'process',
            'p': p
        })
    
    def postprocess(self, p, processed, gr_enable, *args, **kw):
        if not gr_enable:
            return
        self.to_send_list.append({
            'type': 'postprocess',
            'processed': processed
        })

    def process_batch(self, p, gr_enable, *args, batch_number, prompts, seeds, subseeds):
        if not gr_enable:
            return
        self.to_send_list.append({
            'type': 'process_batch',
            'batch_number': batch_number, 'prompts': prompts, 'seeds': seeds, 'subseeds': subseeds
        })

    def postprocess_batch(self, p, gr_enable, *args, images, batch_number):
        if not gr_enable:
            return
        self.to_send_list.append({
            'type': 'postprocess_batch',
            # 'images': images,
            'batch_number': batch_number
        })

    def before_component(self, component, *args,**kwargs):
        # self.to_send_list.append(component)
        pass

    def after_component(self, component, *args, **kwargs):
        # print(str(component))
        #self.to_send_list.append(component)
        pass

    def before_process_batch(self, p, gr_enable, *args, batch_number, prompts, seeds, subseeds):
        if not gr_enable:
            return
        self.to_send_list.append({
            'type': 'before_process_batch',
            'batch_number': batch_number, 'prompts': prompts, 'seeds': seeds, 'subseeds': subseeds
        })
    
    def postprocess_image(self, p, pp: PostprocessImageArgs, gr_enable, *args):
        if not gr_enable:
            return
        self.to_send_list.append({
            'type': 'postprocess_image',
            'pp': pp
        })
    

def WebSocketExtension_unloaded():
    print('WebSocketExtension_unloaded')

script_callbacks.on_script_unloaded(WebSocketExtension_unloaded)
