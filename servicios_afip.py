import os
from afip import Afip

def inicializar_afip():
    cuit = os.environ.get('CUIT', '20409378472')
    cert_path = os.environ.get('CERT_PATH')
    key_path = os.environ.get('KEY_PATH')
    
    afip = Afip({
        'CUIT': cuit,
        'cert': cert_path,
        'key': key_path,
        'production': False
    })
    return afip
