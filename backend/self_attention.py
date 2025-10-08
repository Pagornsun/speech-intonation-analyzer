# backend/self_attention.py
# รองรับทั้ง Keras 3 และ TF/Keras 2.x
try:
    # Keras 3
    from keras.saving import register_keras_serializable
    import keras as K
except Exception:
    # TF/Keras 2.x
    from tensorflow.keras.utils import register_keras_serializable  # type: ignore
    import tensorflow as K  # ใช้ K.layers, K.backend

import tensorflow as tf
from tensorflow.keras import layers

@register_keras_serializable(package="custom")
class SelfAttention(layers.Layer):
    def __init__(self, embed_dim: int, **kwargs):
        super().__init__(**kwargs)
        self.embed_dim = embed_dim
        self.q = layers.Dense(embed_dim, use_bias=False, name="q")
        self.k = layers.Dense(embed_dim, use_bias=False, name="k")
        self.v = layers.Dense(embed_dim, use_bias=False, name="v")
        self.out = layers.Dense(embed_dim, use_bias=False, name="out")

    def build(self, input_shape):
        # input_shape = (batch, T, D)
        _ = self.q.build(input_shape)
        _ = self.k.build(input_shape)
        _ = self.v.build(input_shape)
        # เอา output ของ attention (T, embed_dim)
        _ = self.out.build((input_shape[0], input_shape[1], self.embed_dim))
        super().build(input_shape)

    def call(self, x):
        # x: (B, T, D)
        q = self.q(x)
        k = self.k(x)
        v = self.v(x)
        scale = tf.cast(tf.shape(k)[-1], tf.float32) ** -0.5
        attn = tf.matmul(q, k, transpose_b=True) * scale  # (B, T, T)
        w = tf.nn.softmax(attn, axis=-1)
        y = tf.matmul(w, v)  # (B, T, D)
        return self.out(y)

    def get_config(self):
        cfg = super().get_config()
        cfg.update({"embed_dim": self.embed_dim})
        return cfg
