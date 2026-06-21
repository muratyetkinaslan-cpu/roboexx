/**
 * Blockly toolbox tanımı (XML).
 *
 * Her donanım bileşeni (LED, Röle, Servo, Buzzer, DC Motor, Servo v2,
 * RGB LED, Buton, Potansiyometre, Sıcaklık, Mesafe, IR, NeoPixel, OLED)
 * AYRI bir kategoriye sahip — tek "Aktüatörler/Sensörler" altında
 * label ile gruplanmıyor. Bu sayede çocuk doğrudan istediği parçayı bulur.
 *
 * Kategori renkleri actuator_category (turuncu) ve sensor_category (mavi)
 * style'larını paylaşır — tema paletinden gelir.
 */
export const toolboxXml = `
<xml id="roboexx-toolbox" style="display: none">

  <category name="Akış" categorystyle="logic_category">
    <block type="rx_forever"></block>
    <block type="controls_if"></block>
    <block type="controls_ifelse"></block>
    <block type="controls_repeat_ext">
      <value name="TIMES"><shadow type="math_number"><field name="NUM">10</field></shadow></value>
    </block>
    <block type="controls_whileUntil"></block>
    <block type="controls_for">
      <value name="FROM"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
      <value name="TO"><shadow type="math_number"><field name="NUM">10</field></shadow></value>
      <value name="BY"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
    </block>
    <block type="controls_flow_statements"></block>
    <block type="rx_stop"></block>
  </category>

  <category name="Mantık" categorystyle="operator_category">
    <block type="logic_compare"></block>
    <block type="logic_operation"></block>
    <block type="logic_negate"></block>
    <block type="logic_boolean"></block>
    <block type="logic_ternary"></block>
  </category>

  <category name="Matematik" categorystyle="math_category">
    <block type="math_number"></block>
    <block type="math_arithmetic">
      <value name="A"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
      <value name="B"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
    </block>
    <block type="math_single">
      <value name="NUM"><shadow type="math_number"><field name="NUM">9</field></shadow></value>
    </block>
    <block type="math_trig">
      <value name="NUM"><shadow type="math_number"><field name="NUM">45</field></shadow></value>
    </block>
    <block type="math_constant"></block>
    <block type="math_round">
      <value name="NUM"><shadow type="math_number"><field name="NUM">3.1</field></shadow></value>
    </block>
    <block type="math_modulo">
      <value name="DIVIDEND"><shadow type="math_number"><field name="NUM">10</field></shadow></value>
      <value name="DIVISOR"><shadow type="math_number"><field name="NUM">3</field></shadow></value>
    </block>
    <block type="math_constrain">
      <value name="VALUE"><shadow type="math_number"><field name="NUM">50</field></shadow></value>
      <value name="LOW"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
      <value name="HIGH"><shadow type="math_number"><field name="NUM">100</field></shadow></value>
    </block>
    <block type="math_random_int">
      <value name="FROM"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
      <value name="TO"><shadow type="math_number"><field name="NUM">100</field></shadow></value>
    </block>
    <block type="math_random_float"></block>
    <block type="rx_map">
      <value name="VALUE"><shadow type="math_number"><field name="NUM">50</field></shadow></value>
      <value name="FROM_LOW"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
      <value name="FROM_HIGH"><shadow type="math_number"><field name="NUM">100</field></shadow></value>
      <value name="TO_LOW"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
      <value name="TO_HIGH"><shadow type="math_number"><field name="NUM">255</field></shadow></value>
    </block>
    <block type="rx_abs">
      <value name="VALUE"><shadow type="math_number"><field name="NUM">-7</field></shadow></value>
    </block>
  </category>

  <category name="Metin" categorystyle="text_category">
    <block type="text"></block>
    <block type="text_join"></block>
    <block type="text_length">
      <value name="VALUE"><shadow type="text"><field name="TEXT">merhaba</field></shadow></value>
    </block>
    <block type="text_indexOf">
      <value name="VALUE"><shadow type="text"><field name="TEXT">merhaba dünya</field></shadow></value>
      <value name="FIND"><shadow type="text"><field name="TEXT">dünya</field></shadow></value>
    </block>
  </category>

  <category name="Pinler" categorystyle="io_category">
    <block type="rx_pin_mode"></block>
    <block type="rx_digital_write"></block>
    <block type="rx_digital_read"></block>
    <block type="rx_analog_read"></block>
    <block type="rx_pwm_write">
      <value name="DUTY"><shadow type="math_number"><field name="NUM">32768</field></shadow></value>
    </block>
  </category>

  <category name="Zaman" categorystyle="timing_category">
    <block type="rx_delay_ms">
      <value name="MS"><shadow type="math_number"><field name="NUM">500</field></shadow></value>
    </block>
    <block type="rx_delay_s">
      <value name="S"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
    </block>
    <block type="rx_millis"></block>
  </category>

  <category name="Konsol" categorystyle="text_category">
    <block type="rx_print">
      <value name="TEXT"><shadow type="text"><field name="TEXT">Merhaba</field></shadow></value>
    </block>
  </category>

  <sep></sep>

  <category name="LED" categorystyle="led_category">
    <block type="rx_led_builtin"></block>
    <block type="rx_led_external"></block>
  </category>

  <category name="Röle" categorystyle="relay_category">
    <block type="rx_relay"></block>
  </category>

  <category name="Servo" categorystyle="servo_category">
    <block type="rx_servo_angle">
      <value name="ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value>
    </block>
  </category>

  <category name="Buzzer" categorystyle="buzzer_category">
    <block type="rx_buzzer_tone">
      <value name="FREQ"><shadow type="math_number"><field name="NUM">440</field></shadow></value>
      <value name="DUR"><shadow type="math_number"><field name="NUM">200</field></shadow></value>
    </block>
    <block type="rx_buzzer_note">
      <value name="DUR"><shadow type="math_number"><field name="NUM">300</field></shadow></value>
    </block>
    <block type="rx_buzzer_off"></block>
  </category>

  <category name="🎵 Müzik" categorystyle="buzzer_category">
    <block type="rx_play_song"></block>
  </category>

  <category name="DC Motor" categorystyle="dcmotor_category">
    <block type="rx_motor_init"></block>
    <block type="rx_dc_motor">
      <value name="SPEED"><shadow type="math_number"><field name="NUM">50</field></shadow></value>
    </block>
    <block type="rx_dc_motor_stop"></block>
  </category>

  <category name="Servo v2" categorystyle="servo_category">
    <block type="rx_motor_init"></block>
    <block type="rx_servo_v2">
      <value name="ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value>
    </block>
  </category>

  <category name="Servo v3 (PCA9685)" categorystyle="servo_category">
    <block type="rx_pca9685_init"></block>
    <block type="rx_servo_v3">
      <value name="ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value>
    </block>
    <block type="rx_servo_v3_off"></block>
  </category>

  <category name="RGB LED" categorystyle="rgb_category">
    <block type="rx_rgb_init"></block>
    <block type="rx_rgb_set_all"></block>
    <block type="rx_rgb_set_one">
      <value name="INDEX"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
    </block>
    <block type="rx_rgb_clear"></block>
    <block type="rx_rgb_rainbow">
      <value name="STEP"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
    </block>
  </category>

  <category name="NeoPixel" categorystyle="rgb_category">
    <block type="rx_neopixel_init"></block>
    <block type="rx_neopixel_set">
      <value name="INDEX"><shadow type="math_number"><field name="NUM">0</field></shadow></value>
    </block>
    <block type="rx_neopixel_show"></block>
  </category>

  <category name="OLED Ekran" categorystyle="oled_category">
    <block type="rx_oled_init"></block>
    <block type="rx_oled_clear"></block>
    <block type="rx_oled_text">
      <value name="TEXT"><shadow type="text"><field name="TEXT">Merhaba</field></shadow></value>
    </block>
    <block type="rx_oled_scroll_text">
      <value name="TEXT"><shadow type="text"><field name="TEXT">Merhaba RoboExx</field></shadow></value>
    </block>
    <block type="rx_oled_shape"></block>
    <block type="rx_oled_eyes"></block>
    <block type="rx_oled_image"></block>
    <block type="rx_oled_show"></block>
  </category>

  <sep></sep>

  <category name="Buton" categorystyle="button_category">
    <block type="rx_button_pressed"></block>
  </category>

  <category name="🎮 Klavye" categorystyle="button_category">
    <label text="Bilgisayardan basılan tuşlar (BLE bağlıyken)"></label>
    <block type="rx_key_pressed"></block>
    <block type="rx_key_just_pressed"></block>
  </category>

  <category name="🎮 Gamepad" categorystyle="button_category">
    <label text="PC'ye Bluetooth ile bağlı oyun kumandası"></label>
    <block type="rx_gamepad_pressed"></block>
    <block type="rx_gamepad_just_pressed"></block>
  </category>

  <category name="Potansiyometre" categorystyle="pot_category">
    <block type="rx_potentiometer"></block>
  </category>

  <category name="Işık (LDR)" categorystyle="ldr_category">
    <block type="rx_ldr_read"></block>
  </category>

  <category name="Mesafe Sensörü" categorystyle="ultra_category">
    <block type="rx_ultrasonic_distance"></block>
  </category>

  <category name="Sıcaklık" categorystyle="sensor_category">
    <block type="rx_internal_temp"></block>
    <block type="rx_dht11_temp"></block>
    <block type="rx_dht11_humidity"></block>
    <block type="rx_shtc3_init"></block>
    <block type="rx_shtc3_temp"></block>
    <block type="rx_shtc3_humidity"></block>
  </category>

  <category name="IR Sensör" categorystyle="ir_category">
    <block type="rx_ir_init"></block>
    <block type="rx_ir_read_code"></block>
  </category>

  <sep></sep>

  <category name="Değişkenler" categorystyle="variable_category" custom="VARIABLE"></category>

  <category name="Fonksiyonlar" categorystyle="procedure_category" custom="PROCEDURE"></category>

</xml>
`;
