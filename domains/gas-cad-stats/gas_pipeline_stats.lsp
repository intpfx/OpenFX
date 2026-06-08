;;; gas_pipeline_stats.lsp
;;; 按实体有效颜色和文本关键字提取燃气管道工程量。
;;;
;;; 在 AutoCAD / 兼容 CAD 中的使用方法：
;;;   1. 用 APPLOAD 加载本文件。
;;;   2. 执行命令：GASSTAT
;;;   3. 在图纸所在目录查看导出的 gas_summary_by_pipe_category.csv。
;;;
;;; 输出文件：
;;;   gas_summary_by_pipe_category.csv - 管径/类型小计

(vl-load-com)

;;; 颜色和管径对应关系。
;;; 其中 de 为地埋塑料管，DN 为架空钢管。
;;; 如果实体颜色是 ByLayer，脚本会尽量解析为所在图层的颜色。
(setq *gas-color-dn-map*
  '(
    ("RGB:255,191,0" . "de32")
    ("RGB:0,0,255" . "DN50")
    ("RGB:0,255,0" . "DN40")
    ("RGB:255,255,255" . "DN25")
    ("RGB:0,255,255" . "de63")
    ("RGB:255,255,0" . "DN32")
   )
)

;;; 明确不参与统计的颜色。
(setq *gas-ignore-color-keys*
  '(
    "RGB:128,128,128"
   )
)

(setq *gas-pillar-keyword* "立柱")
(setq *gas-crossing-keyword* "CY")
(setq *gas-waterdrill-keyword* "SZ")

(defun gas-csv-escape (s / out)
  (setq s (if s (vl-princ-to-string s) ""))
  (setq out (vl-string-subst "\"\"" "\"" s))
  (strcat "\"" out "\"")
)

(defun gas-write-line (fp cells / line)
  (setq line "")
  (foreach cell cells
    (setq line
      (strcat line
        (if (= line "") "" ",")
        (gas-csv-escape cell)
      )
    )
  )
  (if fp
    (write-line line fp)
  )
)

(defun gas-safe-get (obj prop / value)
  (setq value (vl-catch-all-apply 'vlax-get-property (list obj prop)))
  (if (vl-catch-all-error-p value) nil value)
)

(defun gas-safe-call (fn args / value)
  (setq value (vl-catch-all-apply fn args))
  (if (vl-catch-all-error-p value) nil value)
)

(defun gas-layer-color (doc layer-name / layers layer color)
  (setq layers (vla-get-Layers doc))
  (setq layer (gas-safe-call 'vla-Item (list layers layer-name)))
  (if layer
    (progn
      (setq color (gas-safe-get layer 'Color))
      (if color color 256)
    )
    256
  )
)

(defun gas-layer-rgb-key (doc layer-name / layers layer true-color r g b)
  (setq layers (vla-get-Layers doc))
  (setq layer (gas-safe-call 'vla-Item (list layers layer-name)))
  (if layer
    (progn
      (setq true-color (gas-safe-get layer 'TrueColor))
      (if true-color
        (progn
          (setq r (gas-safe-get true-color 'Red))
          (setq g (gas-safe-get true-color 'Green))
          (setq b (gas-safe-get true-color 'Blue))
          (if (and r g b (not (and (= r 0) (= g 0) (= b 0))))
            (strcat "RGB:" (itoa r) "," (itoa g) "," (itoa b))
            nil
          )
        )
        nil
      )
    )
    nil
  )
)

(defun gas-effective-aci (doc obj / c layer-name)
  (setq c (gas-safe-get obj 'Color))
  (cond
    ((null c) 256)
    ((= c 256)
      (setq layer-name (gas-safe-get obj 'Layer))
      (if layer-name (gas-layer-color doc layer-name) 256)
    )
    ((= c 0) 0)
    (T c)
  )
)

(defun gas-rgb-key (obj / true-color r g b)
  (setq true-color (gas-safe-get obj 'TrueColor))
  (if true-color
    (progn
      (setq r (gas-safe-get true-color 'Red))
      (setq g (gas-safe-get true-color 'Green))
      (setq b (gas-safe-get true-color 'Blue))
      (if (and r g b (not (and (= r 0) (= g 0) (= b 0))))
        (strcat "RGB:" (itoa r) "," (itoa g) "," (itoa b))
        nil
      )
    )
    nil
  )
)

(defun gas-color-key (doc obj / rgb aci c layer-name layer-rgb)
  (setq c (gas-safe-get obj 'Color))
  (if (and c (= c 256))
    (progn
      (setq layer-name (gas-safe-get obj 'Layer))
      (setq layer-rgb (if layer-name (gas-layer-rgb-key doc layer-name) nil))
      (if layer-rgb
        layer-rgb
        (progn
          (setq aci (gas-effective-aci doc obj))
          (strcat "ACI:" (itoa aci))
        )
      )
    )
    (progn
      (setq rgb (gas-rgb-key obj))
      (if rgb
        rgb
        (progn
          (setq aci (gas-effective-aci doc obj))
          (strcat "ACI:" (itoa aci))
        )
      )
    )
  )
)

(defun gas-clean-text (s)
  (if (null s) (setq s ""))
  (setq s (vl-string-subst " " "\\P" s))
  (setq s (vl-string-subst " " "\\p" s))
  (setq s (vl-string-subst "" "{" s))
  (setq s (vl-string-subst "" "}" s))
  (vl-string-trim " \t\r\n" s)
)

(defun gas-alpha-num-char-p (ch)
  (or
    (and (>= ch 48) (<= ch 57))
    (and (>= ch 65) (<= ch 90))
    (and (>= ch 97) (<= ch 122))
    (= ch 46)
  )
)

(defun gas-find-prefixed-pipe (text prefix keep-prefix / s pos i ch pipe)
  (setq s (strcase text))
  (setq pos (vl-string-search (strcase prefix) s))
  (if pos
    (progn
      (setq i (+ pos (strlen prefix)))
      (setq pipe keep-prefix)
      (while (and (< i (strlen s))
                  (setq ch (ascii (substr s (+ i 1) 1)))
                  (>= ch 48)
                  (<= ch 57))
        (setq pipe (strcat pipe (substr s (+ i 1) 1)))
        (setq i (1+ i))
      )
      (if (> (strlen pipe) (strlen keep-prefix)) pipe nil)
    )
    nil
  )
)

(defun gas-find-pipe (text / de dn)
  (setq de (gas-find-prefixed-pipe text "DE" "de"))
  (setq dn (gas-find-prefixed-pipe text "DN" "DN"))
  (cond
    (de de)
    (dn dn)
    (T nil)
  )
)

(defun gas-number-chars-p (ch)
  (or (and (>= ch 48) (<= ch 57)) (= ch 46))
)

(defun gas-extract-numbers (text / i n ch token nums)
  (setq i 1)
  (setq n (strlen text))
  (setq token "")
  (setq nums '())
  (while (<= i n)
    (setq ch (ascii (substr text i 1)))
    (if (gas-number-chars-p ch)
      (setq token (strcat token (substr text i 1)))
      (progn
        (if (> (strlen token) 0)
          (progn
            (setq nums (append nums (list (atof token))))
            (setq token "")
          )
        )
      )
    )
    (setq i (1+ i))
  )
  (if (> (strlen token) 0)
    (setq nums (append nums (list (atof token))))
  )
  nums
)

(defun gas-last (lst)
  (if (cdr lst) (gas-last (cdr lst)) (car lst))
)

(defun gas-after-char-number (text marker / pos start sub nums)
  (setq pos (vl-string-search marker text))
  (if pos
    (progn
      (setq start (+ pos (strlen marker)))
      (setq sub (substr text (+ start 1)))
      (setq nums (gas-extract-numbers sub))
      (if nums (car nums) nil)
    )
    nil
  )
)

(defun gas-before-char (text marker / pos)
  (setq pos (vl-string-search marker text))
  (if pos
    (substr text 1 pos)
    text
  )
)

(defun gas-remove-pipe-from-text (text pipe / upper upper-pipe pos before after)
  (setq text (vl-string-trim " \t\r\n" text))
  (if (or (null pipe) (= pipe ""))
    text
    (progn
      (setq upper (strcase text))
      (setq upper-pipe (strcase pipe))
      (setq pos (vl-string-search upper-pipe upper))
      (if pos
        (progn
          (setq before (if (> pos 0) (substr text 1 pos) ""))
          (setq after (substr text (+ pos (strlen pipe) 1)))
          (vl-string-trim " \t\r\n-_*" (strcat before after))
        )
        text
      )
    )
  )
)

(defun gas-star-category (text pipe / before)
  ;; 非立柱的“*”文本按“*”前内容分类，并去掉其中的管径字样。
  ;; 例如 钢制弯头DN40*1 => 类型为 钢制弯头。
  (setq before (gas-before-char text "*"))
  (setq before (gas-remove-pipe-from-text before pipe))
  (if (= before "") "未分类管件" before)
)

(defun gas-star-value (text / qty)
  ;; 非立柱的“*”文本按“*”后的第一个数字作为数量。
  ;; 例如 钢制弯头DN40*6 => 6。
  (setq qty (gas-after-char-number text "*"))
  (if qty qty 0.0)
)

(defun gas-last-search (needle text / start pos last-pos)
  (setq start 0)
  (setq last-pos nil)
  (while (setq pos (vl-string-search needle text start))
    (setq last-pos pos)
    (setq start (+ pos (strlen needle)))
  )
  last-pos
)

(defun gas-slash-suffix-valid-p (suffix / s i n ch)
  ;; 只移动规格型后缀，例如 /32、/DN32、/de63。
  ;; 普通类型名中如果出现其他“/”内容，不做处理。
  (setq s (strcase suffix))
  (setq n (strlen s))
  (setq i 1)
  (if (= n 0)
    nil
    (progn
      (while (and (<= i n)
                  (setq ch (ascii (substr s i 1)))
                  (or (and (>= ch 48) (<= ch 57))
                      (= ch 68) ; D
                      (= ch 69) ; E
                      (= ch 78))) ; N
        (setq i (1+ i))
      )
      (> i n)
    )
  )
)

(defun gas-move-category-suffix-to-pipe (pipe category / pos suffix clean-category)
  ;; 类型末尾的规格后缀移到管径列：
  ;; DN63 + 电熔变径/32 => DN63/32 + 电熔变径
  ;; DN63 + 钢塑转换/DN32 => DN63/DN32 + 钢塑转换
  (setq pos (gas-last-search "/" category))
  (if pos
    (progn
      (setq suffix (substr category (+ pos 2)))
      (if (gas-slash-suffix-valid-p suffix)
        (progn
          (setq clean-category (vl-string-trim " \t\r\n" (substr category 1 pos)))
          (list (strcat pipe "/" suffix) clean-category)
        )
        (list pipe category)
      )
    )
    (list pipe category)
  )
)

(defun gas-pillar-count (text / count nums)
  ;; 立柱根数规则：优先读取 * 后面的数字，例如 DN40立柱*3-2.5 中的 3。
  ;; 如果格式不标准，则兜底取倒数第二个数字。
  (setq count (gas-after-char-number text "*"))
  (if count
    count
    (progn
      (setq nums (gas-extract-numbers text))
      (if (>= (length nums) 3)
        (nth (- (length nums) 2) nums)
        0.0
      )
    )
  )
)

(defun gas-pillar-value (text / count len nums)
  ;; 格式示例：DN40立柱*3-2.5 => 3 * 2.5 = 7.5
  (setq count (gas-pillar-count text))
  (setq len (gas-after-char-number text "-"))
  (cond
    ((and count len) (* count len))
    (T
      ;; 兜底规则：如果立柱文本格式不标准，则取最后两个数字相乘。
      ;; 例如 DN40立柱3根2.5米 通常也能得到正确结果。
      (setq nums (gas-extract-numbers text))
      (if (>= (length nums) 3)
        (* (nth (- (length nums) 2) nums) (gas-last nums))
        0.0
      )
    )
  )
)

(defun gas-normal-value (text / nums pipe)
  ;; 普通管线长度规则：取文本中的最后一个数字。
  ;; 如果文本里只有 DN/de 管径数字，没有长度数字，则记为 0。
  (setq nums (gas-extract-numbers text))
  (setq pipe (gas-find-pipe text))
  (cond
    ((null nums) 0.0)
    ((and pipe (= (length nums) 1)) 0.0)
    (T (gas-last nums))
  )
)

(defun gas-category (text pipe / upper)
  (setq upper (strcase text))
  (cond
    ((vl-string-search *gas-pillar-keyword* text) "立柱")
    ((vl-string-search "*" text) (gas-star-category text pipe))
    ((vl-string-search *gas-crossing-keyword* upper) "穿越")
    ((vl-string-search *gas-waterdrill-keyword* upper) "水钻")
    ((= (substr pipe 1 2) "DN") "架空")
    (T "开挖")
  )
)

(defun gas-add-sum (key value sums / pair)
  (setq pair (assoc key sums))
  (if pair
    (subst (cons key (+ (cdr pair) value)) pair sums)
    (append sums (list (cons key value)))
  )
)

(defun gas-add-sample (color-key text samples / pair existing)
  (setq pair (assoc color-key samples))
  (if pair
    (progn
      (setq existing (cdr pair))
      (if (< (length existing) 5)
        (subst (cons color-key (append existing (list text))) pair samples)
        samples
      )
    )
    (append samples (list (cons color-key (list text))))
  )
)

(defun gas-record-from-object (doc obj forced-text / type text color-key pipe value category layer handle count moved)
  (setq type (gas-safe-get obj 'ObjectName))
  (setq text
    (cond
      (forced-text forced-text)
      ((gas-safe-get obj 'TextString))
      ((gas-safe-get obj 'Text))
      (T "")
    )
  )
  (setq text (gas-clean-text text))
  (if (> (strlen text) 0)
    (progn
      (setq color-key (gas-color-key doc obj))
      (if (member color-key *gas-ignore-color-keys*)
        nil
        (progn
          (setq pipe (gas-find-pipe text))
          (if (null pipe) (setq pipe (cdr (assoc color-key *gas-color-dn-map*))))
          (if pipe
            (progn
              (setq category (gas-category text pipe))
              (setq moved (gas-move-category-suffix-to-pipe pipe category))
              (setq pipe (car moved))
              (setq category (cadr moved))
              (setq value
                (cond
                  ((vl-string-search *gas-pillar-keyword* text) (gas-pillar-value text))
                  ((vl-string-search "*" text) (gas-star-value text))
                  (T (gas-normal-value text))
                )
              )
              (setq count
                (if (vl-string-search *gas-pillar-keyword* text)
                  (gas-pillar-count text)
                  0.0
                )
              )
              (setq layer (gas-safe-get obj 'Layer))
              (setq handle (gas-safe-get obj 'Handle))
              (list pipe category value count color-key layer handle text type)
            )
            (progn
              (setq *gas-unmapped-count* (1+ *gas-unmapped-count*))
              nil
            )
          )
        )
      )
    )
    nil
  )
)

(defun gas-process-record (rec / pipe category value count key)
  (setq pipe (nth 0 rec))
  (setq category (nth 1 rec))
  (setq value (nth 2 rec))
  (setq count (nth 3 rec))
  (if (> value 0.0)
    (progn
      (setq key (strcat pipe "|" category))
      (setq *gas-sums-by-pipe-category* (gas-add-sum key value *gas-sums-by-pipe-category*))
      (if (= category "立柱")
        (setq *gas-counts-by-pipe-category* (gas-add-sum key count *gas-counts-by-pipe-category*))
      )
    )
  )
)

(defun gas-process-object (doc obj / rec attrs attr att-text)
  (setq rec (gas-record-from-object doc obj nil))
  (if rec (gas-process-record rec))

  ;; 块参照中的属性文字不一定会作为独立实体被遍历到，
  ;; 因此这里对 INSERT 的属性进行额外处理。
  (if (= :vlax-true (gas-safe-get obj 'HasAttributes))
    (progn
      (setq attrs (gas-safe-call 'vlax-invoke (list obj 'GetAttributes)))
      (if attrs
        (foreach attr attrs
          (setq att-text (gas-safe-get attr 'TextString))
          (setq rec (gas-record-from-object doc attr att-text))
          (if rec (gas-process-record rec))
        )
      )
    )
  )
)

(defun gas-output-dir (doc / path)
  (setq path (getvar "DWGPREFIX"))
  (if (or (null path) (= path ""))
    (setq path (getvar "TEMPPREFIX"))
  )
  path
)

(defun gas-delete-if-exists (path)
  (if (and path (findfile path))
    (vl-file-delete path)
  )
)

(defun gas-open-output-file (doc filename / dir path fp tmp-dir tmp-path)
  ;; 优先输出到图纸所在目录；如果目录不可写，则自动输出到 CAD 临时目录。
  (setq dir (gas-output-dir doc))
  (setq path (if dir (strcat dir filename) filename))
  (setq fp (open path "w"))
  (if fp
    (list fp path dir)
    (progn
      (setq tmp-dir (getvar "TEMPPREFIX"))
      (setq tmp-path (if tmp-dir (strcat tmp-dir filename) filename))
      (setq fp (open tmp-path "w"))
      (if fp
        (progn
          (princ (strcat "\n提示：图纸所在目录无法写入，已改为输出到临时目录：" tmp-path))
          (list fp tmp-path tmp-dir)
        )
        (progn
          (princ (strcat "\n错误：无法创建输出文件：" path))
          nil
        )
      )
    )
  )
)

(defun gas-format-number (value / s)
  (setq s (rtos value 2 4))
  (setq s (vl-string-right-trim "0" s))
  (setq s (vl-string-right-trim "." s))
  (if (= s "") "0" s)
)

(defun gas-write-outputs (doc / dir opened out-path fp pair parts count-pair remark)
  (setq dir (gas-output-dir doc))

  ;; 清理旧版脚本可能留下的中间文件，避免客户误看。
  (if dir
    (progn
      (gas-delete-if-exists (strcat dir "gas_raw_records.csv"))
      (gas-delete-if-exists (strcat dir "gas_color_samples.csv"))
      (gas-delete-if-exists (strcat dir "gas_summary_by_pipe.csv"))
    )
  )

  (setq opened (gas-open-output-file doc "gas_summary_by_pipe_category.csv"))
  (if opened
    (progn
      (setq fp (car opened))
      (setq out-path (cadr opened))
      (gas-write-line fp '("管径" "类型" "合计值" "备注"))
      (foreach pair *gas-sums-by-pipe-category*
        (setq parts (gas-split-key (car pair) "|"))
        (setq remark "")
        (if (= (cadr parts) "立柱")
          (progn
            (setq count-pair (assoc (car pair) *gas-counts-by-pipe-category*))
            (if count-pair
              (setq remark (strcat (rtos (cdr count-pair) 2 0) "根"))
            )
          )
        )
        (gas-write-line fp (list (car parts) (cadr parts) (gas-format-number (cdr pair)) remark))
      )
      (close fp)
      (princ (strcat "\n完成。统计文件已输出到：" out-path))
      (if (> *gas-unmapped-count* 0)
        (princ (strcat "\n提示：已跳过 " (itoa *gas-unmapped-count*) " 条未配置颜色映射的数据。"))
      )
    )
    (princ "\n未能生成统计文件，请检查图纸目录或 CAD 临时目录是否可写。")
  )
)

(defun gas-split-key (s sep / pos)
  (setq pos (vl-string-search sep s))
  (if pos
    (list (substr s 1 pos) (substr s (+ pos 2)))
    (list s "")
  )
)

(defun c:GASSTAT (/ acad doc layouts layout block obj)
  (setq acad (vlax-get-acad-object))
  (setq doc (vla-get-ActiveDocument acad))

  (setq *gas-sums-by-pipe-category* '())
  (setq *gas-counts-by-pipe-category* '())
  (setq *gas-unmapped-count* 0)

  (setq layouts (vla-get-Layouts doc))
  (vlax-for layout layouts
    (setq block (vla-get-Block layout))
    (vlax-for obj block
      (gas-process-object doc obj)
    )
  )

  (gas-write-outputs doc)
  (princ)
)

(princ "\ngas_pipeline_stats.lsp 已加载。执行 GASSTAT 生成统计文件。")
(princ)
